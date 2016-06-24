'use strict';

var async = require('async');

var Finalizer = function Finalizer() {
    this.calls = 0;
    this.final_callback = null;
    this.final_callback_args = null;
};

Finalizer.prototype.wrap = function (func) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        this.calls += 1;
        var callback = args.pop();
        args.push(function () {
            var cb_args = Array.prototype.slice.call(arguments);
            this.calls -= 1;

            callback.apply(null, cb_args);
            if (this.calls === 0 && this.final_callback) {
                return this.final_callback.apply(null, this.final_callback_args);
            }
        }.bind(this));

        return func.apply(null, args);
    }.bind(this);
};

Finalizer.prototype.wrap_auto = function (func) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        this.calls += 1;
        var callback = args.shift();
        args.unshift(function () {
            var cb_args = Array.prototype.slice.call(arguments);
            this.calls -= 1;

            callback.apply(null, cb_args);
            if (this.calls === 0 && this.final_callback) {
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
        callback.apply(null, args);
    }.bind(this);
    return cb_func;
};

var wrapped_functions = {
    each: (arr, iterator, cb) => {
        var f = new Finalizer();
        return async.each(arr, f.wrap(iterator), f.callback(cb));
    },
    eachLimit: (arr, limit, iterator, cb) => {
        var f = new Finalizer();
        return async.eachLimit(arr, limit, f.wrap(iterator), f.callback(cb));
    },
    map: (arr, iterator, cb) => {
        var f = new Finalizer();
        return async.map(arr, f.wrap(iterator), f.callback(cb));
    },
    mapLimit: (arr, limit, iterator, cb) => {
        var f = new Finalizer();
        return async.mapLimit(arr, limit, f.wrap(iterator), f.callback(cb));
    },
    parallel: (arr_or_obj, cb) => {
        var f = new Finalizer();
        if (Array.isArray(arr_or_obj)) {
            arr_or_obj = arr_or_obj.map(func => f.wrap(func));
        } else {
            arr_or_obj = Object.keys(arr_or_obj).reduce((obj, func_name) => {
                obj[func_name] = f.wrap(arr_or_obj[func_name]);
                return obj;
            }, {});
        }
        return async.parallel(arr_or_obj, f.callback(cb));
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
    times: (n, iterator, cb) => {
        var f = new Finalizer();
        return async.times(n, f.wrap(iterator), f.callback(cb));
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
        return async.auto(tasks, concurrency, f.callback(cb));
    }
};

var exports = {};
Object.keys(async).forEach(name => exports[name] = async[name]);
Object.keys(wrapped_functions).forEach(name => exports[name] = wrapped_functions[name]);

module.exports = exports;
