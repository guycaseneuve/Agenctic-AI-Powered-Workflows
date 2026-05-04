/**
 * CJS stub for `marked`.
 * After npm audit fix, marked is upgraded to an ESM-only version which Jest
 * (running in CommonJS mode) cannot parse. This stub replaces it in tests so
 * routes that call marked(text) or marked.parse(text) still return a string
 * without crashing, keeping smoke tests focused on routing behaviour.
 */
const stub = (text) => String(text);
stub.parse = (text) => String(text);
module.exports = stub;
