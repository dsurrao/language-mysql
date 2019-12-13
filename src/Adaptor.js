import { execute as commonExecute, expandReferences } from 'language-common';
import { resolve as resolveUrl } from 'url';
import mysql from 'mysql';
import squel from 'squel';

/** @module Adaptor */

/**
 * Execute a sequence of operations.
 * Wraps `language-common/execute`, and prepends initial state for mysql.
 * @example
 * execute(
 *   create('foo'),
 *   delete('bar')
 * )(state)
 * @constructor
 * @param {Operations} operations - Operations to be performed.
 * @returns {Operation}
 */
export function execute(...operations) {
  const initialState = {
    references: [],
    data: null,
  };

  return state => {
    return commonExecute(
      connect,
      ...operations,
      disconnect,
      cleanupState
    )({ ...initialState, ...state });
  };
}

function connect(state) {
  const { host, port, database, password, user } = state.configuration;

  var connection = mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
    port: port,
  });

  connection.connect();
  console.log(`Preparing to query "` + database + `"...`);
  return { ...state, connection: connection };
}

function disconnect(state) {
  state.connection.end();
  return state;
}

function cleanupState(state) {
  delete state.connection;
  return state;
}

/**
 * Execute an SQL statement
 * @example
 * execute(
 *   insert(table, fields)
 * )(state)
 * @constructor
 * @param {string} table - the table
 * @param {object} fields - a fields object
 * @returns {Operation}
 */
export function insert(table, fields) {
  return state => {
    let { connection } = state;

    const valuesObj = expandReferences(fields)(state);

    const squelMysql = squel.useFlavour('mysql');

    var sqlParams = squelMysql
      .insert({
        autoQuoteFieldNames: true,
      })
      .into(table)
      .setFields(valuesObj)
      .toParam();

    var sql = sqlParams.text;
    var inserts = sqlParams.values;
    sqlString = mysql.format(sql, inserts);

    console.log('Executing MySQL query: ' + sqlString);

    return new Promise((resolve, reject) => {
      // execute a query on our database

      // TODO: figure out how to escape the string.

      connection.query(sqlString, function(err, results, fields) {
        if (err) {
          reject(err);
          // Disconnect if there's an error.
          console.log("That's an error. Disconnecting from database.");
          connection.end();
        } else {
          console.log('Success...');
          console.log(results);
          console.log(fields);
          resolve(results);
        }
      });
    }).then(data => {
      const nextState = { ...state, response: { body: data } };
      return nextState;
    });
  };
}

/**
 * Execute an SQL INSERT ... ON DUPLICATE KEY UPDATE statement
 * @example
 * execute(
 *   upsert(table, fields)
 * )(state)
 * @constructor
 * @param {object} sqlQuery - Payload data for the message
 * @returns {Operation}
 */
export function upsert(table, fields) {
  return state => {
    let { connection } = state;

    const valuesObj = expandReferences(fields)(state);

    const squelMysql = squel.useFlavour('mysql');

    var insertParams = squelMysql
      .insert({
        autoQuoteFieldNames: true,
      })
      .into(table)
      .setFields(valuesObj)
      .toParam();

    var sql = insertParams.text;
    var inserts = insertParams.values;
    const insertString = mysql.format(sql, inserts);

    var updateParams = squelMysql
      .update({
        autoQuoteFieldNames: true,
      })
      .table('')
      .setFields(valuesObj)
      .toParam();

    var sql = updateParams.text;
    var inserts = updateParams.values;
    const updateString = mysql.format(sql, inserts);

    const upsertString =
      insertString + ` ON DUPLICATE KEY UPDATE ` + updateString.slice(10);

    console.log('Executing MySQL query: ' + upsertString);

    return new Promise((resolve, reject) => {
      // execute a query on our database

      // TODO: figure out how to escape the string.

      connection.query(upsertString, function(err, results, fields) {
        if (err) {
          reject(err);
          // Disconnect if there's an error.
          console.log("That's an error. Disconnecting from database.");
          connection.end();
        } else {
          console.log('Success...');
          console.log(results);
          console.log(fields);
          resolve(results);
        }
      });
    }).then(data => {
      const nextState = { ...state, response: { body: data } };
      return nextState;
    });
  };
}

/**
 * Execute an SQL statement
 * @example
 * execute(
 *   sql(sqlQuery)
 * )(state)
 * @constructor
 * @param {object} sqlQuery - Payload data for the message
 * @returns {Operation}
 */
export function sqlString(fun) {
  return state => {
    let { connection } = state;

    const body = fun(state);

    console.log('Executing MySQL statement: ' + body);

    return new Promise((resolve, reject) => {
      // execute a query on our database
      connection.query(body, function(err, results, fields) {
        if (err) {
          reject(err);
          // Disconnect if there's an error.
          console.log("That's an error. Disconnecting from database.");
          connection.end();
        } else {
          console.log('Success...');
          resolve(JSON.parse(JSON.stringify(results)));
        }
      });
    }).then(data => {
      console.log(data);
      const nextState = { ...state, response: { body: data } };
      return nextState;
    });
  };
}

export {
  field,
  fields,
  sourceValue,
  alterState,
  arrayToString,
  each,
  combine,
  merge,
  dataPath,
  dataValue,
  lastReferenceValue,
} from 'language-common';
