'use strict';

var async = require('async');

var Finalizer = function Finalizer() {
    this.calls = 0;
    this.final_callback = null;
    this.final_callback_args = null;
    this.final_callback_called = false;
};

Finalizer.prototype.wrap = function (func) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        if (this.final_callback_called) {
            // this can happen in dependent async.auto() tasks
            return setImmediate(callback, new Error('final callback already called'));
        }
        this.calls += 1;
        args.push(function () {
            var cb_args = Array.prototype.slice.call(arguments);
            this.calls -= 1;

            callback.apply(null, cb_args);
            if (this.calls === 0 && this.final_callback && !this.final_callback_called) {
                this.final_callback_called = true;
                return this.final_callback.apply(null, this.final_callback_args);
            }
        }.bind(this));

        return func.apply(null, args);
    }.bind(this);
};

/**
 * Async 2.0 and above provides the callback argument as the last argument, but we're used to receiving it as the first argument.
 * Rather than change all of our async.auto calls, we switch the callback to be the first argument here.
 *
 * @param {Function} func Original task function
 * @returns {Function} Wrapped task function
 */
Finalizer.prototype.wrap_auto = function (func) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        if (this.final_callback_called) {
            // this can happen in dependent async.auto() tasks
            return setImmediate(callback, new Error('final callback already called'));
        }
        this.calls += 1;
        args.unshift(function () {
            var cb_args = Array.prototype.slice.call(arguments);
            this.calls -= 1;

            callback.apply(null, cb_args);
            if (this.calls === 0 && this.final_callback && !this.final_callback_called) {
                this.final_callback_called = true;
                return this.final_callback.apply(null, this.final_callback_args);
            }
        }.bind(this));

        return func.apply(null, args);
    }.bind(this);
};

Finalizer.prototype.callback = function (callback) {
    callback = callback || function () { return; };
    var cb_func = function () {
        var args = Array.prototype.slice.call(arguments);
        if (this.calls > 0) {
            if (!this.final_callback) {
                this.final_callback = callback;
                this.final_callback_args = args;
            }
            return;
        }
        this.final_callback_called = true;
        callback.apply(null, args);
    }.bind(this);
    return cb_func;
};

var wrapped_functions = {
    eachLimit: (arr, limit, iterator, cb) => {
        var f = new Finalizer();
        return async.eachLimit(arr, limit, f.wrap(iterator), f.callback(cb));
    },
    mapLimit: (arr, limit, iterator, cb) => {
        var f = new Finalizer();
        return async.mapLimit(arr, limit, f.wrap(iterator), f.callback(cb));
    },
    parallelLimit: (arr_or_obj, limit, cb) => {
        var f = new Finalizer();
        if (Array.isArray(arr_or_obj)) {
            arr_or_obj = arr_or_obj.map(func => f.wrap(func));
        } else {
            arr_or_obj = Object.keys(arr_or_obj).reduce((obj, func_name) => {
                obj[func_name] = f.wrap(arr_or_obj[func_name]);
                return obj;
            }, {});
        }
        return async.parallelLimit(arr_or_obj, limit, f.callback(cb));
    },
    timesLimit: (n, limit, iterator, cb) => {
        var f = new Finalizer();
        return async.timesLimit(n, limit, f.wrap(iterator), f.callback(cb));
    },
    auto: (tasks, concurrency, cb) => {
        var f = new Finalizer();
        Object.keys(tasks).forEach(task_name => {
            var arr_or_func = tasks[task_name];
            if (Array.isArray(arr_or_func)) {
                arr_or_func.push(f.wrap_auto(arr_or_func.pop()));
            } else {
                arr_or_func = f.wrap_auto(arr_or_func);
            }
            tasks[task_name] = arr_or_func;
        });
        var args = [tasks];
        if ((typeof concurrency) === 'function') {
            cb = concurrency;
        } else {
            args.push(concurrency);
        }
        args.push(f.callback(cb));
        return async.auto.apply(async, args);
    }
};

var exports = {};
var remove = ['each', 'forEachOf', 'map', 'filter', 'reject', 'detect', 'some', 'every', 'concat', 'parallel', 'applyEach', 'times'];
Object.keys(async).filter(func => remove.indexOf(func) === -1).forEach(name => exports[name] = async[name]);
Object.keys(wrapped_functions).forEach(name => exports[name] = wrapped_functions[name]);

module.exports = exports;
