const {
    Observable
} = require('rxjs');
const {
    map,
    publishReplay,
    tap
} = require('rxjs/operators');

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
                publishReplay()
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

        this.argsCollection.push(args);

        if (this.argsCollection.length === 1) {
            const observable = new Observable(subscriber => {
                    // remove duplicates
                    this.argsCollection = this.argsCollection
                        .filter((filterItem, index, self) => {
                            const existentIndex = self.findIndex(findItem => JSON.stringify(filterItem) === JSON.stringify(findItem));

                            return existentIndex === index;
                        });

                    return this.loader(this.argsCollection)
                        .subscribe(subscriber);
                })
                .pipe(
                    publishReplay()
                );

            this.queue = [observable];
            this.schedule(() => this.dispatch());
        }

        return this.queue[0]
            .pipe(
                map(response => {
                    const stringifiedArgs = JSON.stringify(args);
                    const responseIndex = this.argsCollection.findIndex(item => JSON.stringify(item) === stringifiedArgs);
    
                    return response[responseIndex];
                }),
                tap(null, null, () => {
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
