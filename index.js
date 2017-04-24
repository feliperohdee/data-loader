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
            .publishReplay();

        this.queue.push(observable);

        if (this.queue.length === 1) {
            this.schedule(() => this.dispatch());
        }

        if (shouldCache) {
            this.cache.set(cacheKey, observable);
        }

        return observable;
    }

    schedule(fn) {
        process.nextTick(fn);
    }

    dispatch() {
        while (this.queue.length > 0) {
            const observable = this.queue.shift();

            observable
                .connect();
        }
    }

    buildCacheKey(args, prefix = null) {
        let cacheKey = args;

        if (typeof args === 'object') {
            cacheKey = JSON.stringify(args)
        }

        if(prefix){
            cacheKey = `${prefix}${cacheKey}`;
        }

        return cacheKey;
    }
}
