import EtherscanClient from '@ethercast/etherscan-client';
import { Log, DecodedLog } from '@ethercast/model';
import { S3 } from 'aws-sdk';
import * as Logger from 'bunyan';
import { keccak256 } from 'js-sha3';

export interface DecoderOptions {
  s3: S3;
  client: EtherscanClient;
  logger: Logger;
  BUCKET_NAME: string;
}

export default class Decoder {
  private readonly options: DecoderOptions;

  public constructor(options: DecoderOptions) {
    this.options = options;
  }

  // Decode an Ethereum log, using a bucket in S3 to cache ABIs
  public async decodeLogs(log: Log): Promise<DecodedLog | Log> {
    const { s3, client, logger, BUCKET_NAME } = this.options;

    const childLogger = logger.child({ bucketName: BUCKET_NAME });

    childLogger.debug({ log }, 'decoding log');

    // First extract the signature from the called event
    if (log.topics.length === 0) {
      return log;
    }

    // The first topic contains the keccak256 hash of EventName(arg0type,arg1type,...)
    const eventHash = log.topics[ 0 ].toLowerCase();

    const eventAbiS3Key = `events/${eventHash}`.toLowerCase();
    const contractAbiS3Key = `contracts/${log.address}`.toLowerCase();

    // Look in s3 under the prefix for the event hash first
    try {
      const { Body } = await s3.getObject({ Bucket: BUCKET_NAME, Key: eventAbiS3Key }).promise();

      const memberAbi = JSON.parse(Body.toString());

      childLogger.debug({ memberAbi, eventAbiS3Key }, 'found member abi');

      // TODO: use the abi to decode the log
      return log;
    } catch (err) {
      // object does not exist
      childLogger.debug({ eventAbiS3Key, err }, 'failed to get abi from s3');
    }

    // Check if the contract has been processed - if it has, then we can't do anything more for this log
    try {
      await s3.headObject({ Bucket: BUCKET_NAME, Key: contractAbiS3Key }).promise();
      return log;
    } catch (err) {
      childLogger.debug({ err, address: log.address, contractAbiS3Key }, 'contract abi not found');
    }

    // ABI hasn't been processed for this contract, try fetching it
    try {
      const abi = await client.getAbi(log.address);

      // save the abi to s3
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: contractAbiS3Key,
        Body: JSON.stringify(abi)
      }).promise();

      childLogger.debug({ address: log.address, contractAbiS3Key }, 'contract abi saved to s3');

      let matchingMember = null;

      // take all the members of the contract and put them in s3 under their hash key
      await Promise.all(
        abi.map(
          async member => {
            const { name, inputs } = member;
            const signature = `${name}(${
              inputs && inputs.length > 0
                ? inputs.map(input => input.type && input.type.length > 0 ? input.type : null)
                  .filter(name => name !== null)
                  .join(',') : ''
              })`;

            const hashedSignature = `0x${keccak256.hex(signature).toLowerCase()}`;

            childLogger.debug({
              hashedSignature,
              signature,
              member,
              address: log.address
            }, 'calculated hash from signature');

            if (hashedSignature === eventHash) {
              matchingMember = member;
            }

            switch (member.type) {
              case 'event':
                await s3.putObject({
                  Bucket: BUCKET_NAME,
                  Key: `events/${hashedSignature}`,
                  Body: JSON.stringify(member)
                }).promise();
                break;
              case 'function':
                await s3.putObject({
                  Bucket: BUCKET_NAME,
                  Key: `functions/${hashedSignature}`,
                  Body: JSON.stringify(member)
                }).promise();
                break;

              // TODO: handle the fallback function case by storing it in s3 somewhere
              default:
                childLogger.warn({ member, address: log.address }, 'unrecognized contract abi member type');
            }
          }
        )
      );

      if (matchingMember !== null) {
        childLogger.debug({ matchingMember, log }, 'found match from etherscan abi');
        // TODO: use the abi to decode the log
        return log;
      }
    } catch (err) {
      childLogger.debug({ err, log }, 'failed to fetch or process abi from etherscan');

      return log;
    }


    return log;
  }

}