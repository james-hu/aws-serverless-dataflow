import { expect } from 'chai';
import { Surveyor } from '../src/surveyor';

describe('Surveyor', () => {
    it('shouldInclude(...) handles multiple includes and excludes', () => {
        const surveyor = new Surveyor({
            options: {
                flags: {
                    include: ['*boi*', '*datahub*'],
                    exclude: ['*jameshu*', '*test*'],
                },
            }
        } as any);

        expect(surveyor.shouldInclude('boi.env1.com')).to.be.true;
        expect(surveyor.shouldInclude('datahub.env1.com')).to.be.true;
        expect(surveyor.shouldInclude('v2.datahub.env1.com')).to.be.true;

        expect(surveyor.shouldInclude('boi.test.com')).to.be.false;
        expect(surveyor.shouldInclude('boi.datahub.test.com')).to.be.false;
        expect(surveyor.shouldInclude('jameshu.com')).to.be.false;
    });
});