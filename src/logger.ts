import CatLoggr from 'cat-loggr/ts';
export const logger = new CatLoggr().setLevel(process.env.DEBUG === 'true' ? 'debug' : 'info');
