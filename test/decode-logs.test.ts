import { describe } from 'mocha';
import { expect } from 'chai';
import { handle } from '../src/decode-logs';

describe('decode-logs.ts', async () => {
  it('is a function', () => {
    expect(handle).to.be.a('function');
  });
  it('handles events');

  it('dummy test', async () => {
    expect(true).to.eq(true);
  });
});
