import EtherscanClient from '@ethercast/etherscan-client';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import * as Logger from 'bunyan';
import { JoiLog, Log } from '@ethercast/model';
import Joi from 'joi';
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

const JoiDecodeLogsRequestBody = Joi.object({
  logs: Joi.array().items(JoiLog).min(1).max(100).required()
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

  const { value, error } = JoiDecodeLogsRequestBody.validate<DecodeLogsRequestBody>(body);

  if (error !== null) {
    logger.debug({ error, body }, 'invalid request body');

    cb(null, {
      statusCode: 422,
      body: JSON.stringify({
        message: 'validation error on the request body',
        error
      })
    });

    return;
  }

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
