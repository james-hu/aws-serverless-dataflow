#!/usr/bin/env node

require('../lib')
  .run()
  .catch(require('@oclif/errors/handle'));
