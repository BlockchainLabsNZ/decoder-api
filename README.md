# decoder-api

Serverless API for decoding Ethereum transactions and logs, using Etherscan as a source of contract ABIs

## Introduction

This package describes an API Gateway and Lambda API that exposes two endpoints

- `POST /decode-logs {"logs":[...]}` returns `{"decodedLogs":[...]}`
- `POST /decode-transactions {"transactions":[...]}` returns `{"decodedTransactions":[...]}` 

The idea is that you can pass Ethereum logs or transactions and receive the logs or transactions with the arguments decoded.
It uses Etherscan as a source of truth for ABIs. 

## Testing

Unit testing is done with `mocha` and `chai` and integration testing is performed with a Runscope test suite

`npm test` to run the tests

## Deployment

You must first set up AWS credentials.

`npm run deploy`
