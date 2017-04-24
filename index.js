const {
    Observable
} = require('rxjs');

module.exports = class DataLoader {
    constructor(loader) {
        if (typeof loader !== 'function') {
            throw new Error('loader might be a function.');
        }
        
        this.loader = loader;
        this.queue = [];
        this.cache = new Map();
    }

    get(args) {
        if(args === undefined){
            return Observable.throw(new Error('args are missing.'));
        }

        const cacheKey = this.buildCacheKey(args);
        const cached = this.cache.get(cacheKey);

        if (cached) {
            return cached;
        }

        const observable = Observable.create(subscriber => {
            this.queue.push({
                args,
                subscriber
            });

            if (this.queue.length === 1) {
                this.schedule(() => this.dispatch());
            }
        })
        .publishReplay()
        .refCount();

        this.cache.set(cacheKey, observable);

        return observable;
    }

    schedule(fn){
        process.nextTick(fn);
    }

    dispatch() {
        while (this.queue.length > 0) {
            const {
                args,
                subscriber
            } = this.queue.shift();

            this.loader(args)
                .subscribe(subscriber);
        }
    }

    buildCacheKey(args){
        if(typeof args === 'object'){
            return JSON.stringify(args)
        }

        return args;
    }
}
