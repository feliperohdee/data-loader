const rx = require('rxjs');
const rxop = require('rxjs/operators');

module.exports = class DataLoader {
    constructor(loader) {
        if (typeof loader !== 'function') {
            throw new Error('loader might be a function.');
        }

        this.loader = loader;
        this.queue = [];
        this.cache = new Map();
    }

    get(args, cachePrefix = null) {
        let shouldCache = args !== undefined;
        let cacheKey;
        let cached;

        if (shouldCache) {
            cacheKey = this.buildCacheKey(args, cachePrefix);
            cached = this.cache.get(cacheKey);

            if (cached) {
                return cached;
            }
        }

        const observable = this.loader(args)
            .pipe(
                rxop.publishReplay()
            );

        this.queue.push(observable);

        if (this.queue.length === 1) {
            this.schedule(() => this.dispatch());
        }

        if (shouldCache) {
            this.cache.set(cacheKey, observable);
        }

        return observable;
    }

    multiGet(args) {
        if (!this.argsCollection) {
            this.argsCollection = [];
        }

        if (Array.isArray(args)) {
            return rx.forkJoin(args.map(arg => {
                return this.multiGet(arg);
            }));
        }

        this.argsCollection.push(args);

        if (this.argsCollection.length === 1) {
            const observable = new rx.Observable(subscriber => {
                    // remove duplicates
                    this.argsCollection = this.argsCollection.filter((filterItem, index, self) => {
                        const existentIndex = self.findIndex(findItem => {
                            return JSON.stringify(filterItem) === JSON.stringify(findItem);
                        });

                        return existentIndex === index;
                    });

                    return this.loader(this.argsCollection)
                        .subscribe(subscriber);
                })
                .pipe(
                    rxop.publishReplay()
                );

            this.queue = [observable];
            this.schedule(() => this.dispatch());
        }

        return this.queue[0]
            .pipe(
                rxop.map(response => {
                    const stringifiedArgs = JSON.stringify(args);
                    const responseIndex = this.argsCollection.findIndex(item => {
                        return JSON.stringify(item) === stringifiedArgs;
                    });

                    return response[responseIndex];
                }),
                rxop.tap(null, null, () => {
                    this.argsCollection = null;
                })
            );
    }

    schedule(fn) {
        process.nextTick(fn);
    }

    dispatch() {
        while (this.queue.length > 0) {
            const observable = this.queue.shift();

            observable.connect();
        }
    }

    buildCacheKey(args, prefix = null) {
        let cacheKey = args;

        if (typeof args === 'object') {
            cacheKey = JSON.stringify(args);
        }

        if (prefix) {
            cacheKey = `${prefix}${cacheKey}`;
        }

        return cacheKey;
    }
};