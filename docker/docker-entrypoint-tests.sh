#!/bin/sh

exec npx mocha \
    --require source-map-support/register \
    --recursive \
    --timeout 10000 \
    --reporter mocha-junit-reporter \
    --reporter-options mochaFile=/test-results/junit-report.xml \
    "test/**/*.test.js"
