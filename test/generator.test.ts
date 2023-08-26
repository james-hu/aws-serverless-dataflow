import { expect } from 'chai';
import { Generator } from '../src/generator';

describe('Generate', () => {
  it('should convertSqsUrlToArn(...) work', () => {
    const generator = new Generator({} as any);

    expect(generator.convertSqsUrlToArn('https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue')).to.equal('arn:aws:sqs:us-east-1:123456789012:MyQueue');
  });
});
