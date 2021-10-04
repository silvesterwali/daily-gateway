<div align="center">
  <h1>Daily Gateway</h1>
  <strong>API gateway service also for authentication and user management</strong>
</div>
<br>
<p align="center">
  <a href="https://circleci.com/gh/dailydotdev/daily-gateway">
    <img src="https://img.shields.io/circleci/build/github/dailydotdev/daily-gateway/master.svg" alt="Build Status">
  </a>
  <a href="https://github.com/dailydotdev/daily-gateway/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/dailydotdev/daily-gateway.svg" alt="License">
  </a>
  <a href="https://stackshare.io/daily/daily">
    <img src="http://img.shields.io/badge/tech-stack-0690fa.svg?style=flat" alt="StackShare">
  </a>
</p>

The core concept of this service was to serve a gateway to all the incoming traffic.
As the traffic grew the service introduced some performance spikes so I decided to distribute the traffic through the main load balancer.
Now, this service is focused on user management. Registration, login, logout, referrals, and other user oriented functionality.

## Stack

* Node v14.13.1 (a `.nvmrc` is presented for [nvm](https://github.com/nvm-sh/nvm) users).
* Yarn for managing dependencies.
* Koa as the web framework
* MySQL and knex as a database layer

## Project structure

* `test` - There you can find all the tests and fixtures. Tests are written using `mocha`.
* `helm` - The home of the service helm chart for easily deploying it to kubernetes.
* `seeds` - JSON files with seed data for local development.
* `migrations` - Knex migrations folder.
* `src` - This is obviously the place where you can find the source files.
  * `middlewares` - Custom Koa middlewares.
  * `models` - Database layer functions split by entity type.
  * `routes` - Koa endpoints.
  * `scripts` - Utility scripts for administration tasks.
  * `workers` - Pub/Sub message handlers. 

## Local environment

Daily Gateway requires a running instance of MySQL.

Make sure to apply the latest migrations by running:
`yarn db:migrate:latest`

Check out the [config.js](https://github.com/dailydotdev/daily-gateway/blob/master/src/config.js) file to see the environment variables list.
Some of the variables have a default value preconfigured.

Finally run `yarn watch` to run the service and listen to port `4000`.

## Want to Help?

So you want to contribute to Daily Gateway and make an impact, we are glad to hear it. :heart_eyes:

Before you proceed we have a few guidelines for contribution that will make everything much easier.
We would appreciate if you dedicate the time and read them carefully:
https://github.com/dailydotdev/.github/blob/master/CONTRIBUTING.md
