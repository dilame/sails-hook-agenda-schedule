const requireAll = require('require-all');
const Agenda = require('agenda');
const os = require('os');

module.exports = function SailsHookAgenda(sails) {
  return {
    defaults: {
      __configKey__: {
        dirname: `${sails.config.appPath}/api/agenda`,
        collection: 'agendaJobs',
        name: `${os.hostname()}-${process.pid}`,
        processEvery: '1 minute',
        maxConcurrency: 20,
        defaultConcurrency: 5,
        defaultLockLifetime: 10000,
      },
    },
    initialize(done) {
      const config = sails.config[this.configKey];
      sails.after('lifted', () => {
        this.agenda = new Agenda();
        this.agenda
          .database(config.url, config.collection)
          .name(config.name)
          .processEvery(config.processEvery)
          .maxConcurrency(config.maxConcurrency)
          .defaultConcurrency(config.defaultConcurrency)
          .defaultLockLifetime(config.defaultLockLifetime);
        this.agenda.on('ready', () => this.initAllJobs());
        this.agenda.start();
      });
      sails.on('lower', this.stop);
      sails.on('lowering', this.stop);
      done();
    },
    initAllJobs() {
      const config = sails.config[this.configKey];
      const jobs = requireAll({
        dirname: config.dirname,
        filter: /(.+Job)\.js$/,
        recursive: true,
      });
      Object.keys(jobs)
        .forEach((key) => {
          let job = jobs[key];
          if (typeof job === 'function') job = job(this.agenda);
          return this.defineJob(key, job);
        });
    },
    defineJob(key, job) {
      if (job.disabled) return;
      const name = job.name || key;
      this.agenda.define(name, {
        concurrency: job.concurrency,
        lockLimit: job.lockLimit,
        lockLifetime: job.lockLifetime,
        priority: job.priority,
      }, job.handler);
      this.agenda.every(job.every, name, job.data);
      sails.log.info(`${name} ${job.every} is ready`);
    },
    stop() {
      this.agenda.stop(() => sails.log.info('agenda stopped'));
    },
  };
};
