import EtherscanClient from '@ethercast/etherscan-client';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import * as Logger from 'bunyan';
import { Log } from '@ethercast/model';
import Decoder, { DecoderOptions } from './decoder';

const client = new EtherscanClient({
  apiKey: process.env.ETHERSCAN_API_KEY,
  apiUrl: process.env.ETHERSCAN_API_URL,
  maxRequestsPerSecond: 5
});

const PARSE_REQUEST_ERROR = {
  statusCode: 400,
  body: JSON.stringify({
    message: 'unable to parse or process the request body'
  })
};

const logger = Logger.createLogger({
  name: 'decode-log',
  serializers: Logger.stdSerializers,
  level: process.env.LOG_LEVEL as Logger.LogLevel
});

interface DecodeLogsRequestBody {
  logs: Log[];
}

const s3: S3 = new S3();

const BUCKET_NAME: string = process.env.BUCKET_NAME;

const decoderOptions: DecoderOptions = {
  s3,
  client,
  logger,
  BUCKET_NAME
};

const decoder = new Decoder(decoderOptions);

export const handle: Handler = async (event: APIGatewayEvent, context: Context, cb: Callback) => {
  let body: any;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    logger.debug({ err, requestBody: event.body }, 'request body parsing error');
    cb(null, PARSE_REQUEST_ERROR);
    return;
  }

  if (
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Array.isArray(body.logs) ||
    body.logs.length < 1 ||
    body.logs.length > 100
  ) {
    logger.debug({ body }, 'invalid request body');

    cb(null, {
      statusCode: 422,
      body: JSON.stringify({
        message: 'validation error on the request body - should be object with array of logs'
      })
    });

    return;
  }

  const value = body as DecodeLogsRequestBody;

  try {
    const decodedLogs = await Promise.all(
      value.logs.map(
        log => decoder.decodeLogs(log)
      )
    );

    cb(
      null,
      {
        statusCode: 200,
        body: JSON.stringify({ decodedLogs })
      }
    );
  } catch (err) {
    logger.error({ err }, 'failed to decode all logs');

    cb(null, {
      statusCode: 500,
      body: JSON.stringify({
        message: `an error occurred while decoding logs: ${err.message}`
      })
    });
  }
};
