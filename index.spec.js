const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const DataLoader = require('./');

const {
    graphql,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLInt,
    GraphQLBoolean,
    GraphQLList,
    GraphQLNonNull
} = require('graphql');

const rx = require('./rx');

chai.use(sinonChai);

const expect = chai.expect;
const users = [{
    id: 0,
    name: 'Philip'
}, {
    id: 1,
    name: 'David'
}, {
    id: 2,
    name: 'John'
}, {
    id: 3,
    name: 'George'
}];

const friendsOf = [
    [1, 2, 3],
    [0, 2, 3],
    [0, 1, 3],
    [0, 1, 2]
];

const getUser = sinon.spy(id => new rx.Observable(subscriber => {
        if (!users[id]) {
            subscriber.error(new Error('no user id'));
        }

        subscriber.next(users[id]);
        subscriber.complete();
    })
    .pipe(
        rx.share()
    ));

const User = new GraphQLObjectType({
    name: 'User',
    fields: () => ({
        name: {
            type: GraphQLString
        },
        friends: {
            type: new GraphQLList(User),
            resolve: ({
                id
            }, args, context) => {
                const {
                    userLoader
                } = context;

                return rx.from(friendsOf[id])
                    .pipe(
                        rx.mergeMap(id => userLoader ? userLoader.get(id) : getUser(id)),
                        rx.toArray()
                    )
                    .toPromise();
            }
        }
    })
});

const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
        name: 'Query',
        fields: {
            user: {
                type: User,
                args: {
                    id: {
                        type: new GraphQLNonNull(GraphQLInt)
                    },
                    useLoader: {
                        type: GraphQLBoolean
                    }
                },
                resolve: (root, {
                    id,
                    useLoader
                }, context, info) => {
                    if (useLoader) {
                        if (!context.userLoader) {
                            context.userLoader = new DataLoader(getUser);
                        }

                        return context.userLoader.get(id)
                            .toPromise();
                    }

                    return getUser(id)
                        .toPromise();
                }
            }
        }
    })
});

const asyncGraph = requestString => rx.from(graphql(schema, requestString, {}, {}))
    .pipe(
        rx.tap(response => {
            if (response.errors) {
                throw new Error(response.errors.join());
            }
        })
    );

const query = (id, useLoader = false) => `{
    user(id: ${id}, useLoader: ${useLoader}) {
        name
        friends {
            name
            friends {
                name
                friends {
                    name
                    friends {
                        name
                    }
                }
            }
        }
    }
}`;

describe('index.js', () => {
    let dataLoader;
    let loader;

    beforeEach(() => {
        loader = sinon.spy((key, error = null) => new rx.Observable(subscriber => {
            if (error) {
                return subscriber.error(error);
            }

            subscriber.next(key);
            subscriber.complete();
        }));

        dataLoader = new DataLoader(loader);
    });

    describe('constructor', () => {
        it('shoulds throws if no loader', () => {
            expect(() => new DataLoader()).to.throw('loader must be a function.');
        });

        it('shoulds throws if loader is not a function', () => {
            expect(() => new DataLoader('string')).to.throw('loader must be a function.');
        });

        it('shoulds have a loader', () => {
            expect(dataLoader.loader).to.be.a('function');
        });

        it('shoulds have a queue', () => {
            expect(dataLoader.queue).to.be.an('array');
        });

        it('shoulds have a cache', () => {
            expect(dataLoader.cache).to.be.a('Map');
        });
        
        it('shoulds have a scheduler', () => {
            expect(dataLoader.scheduler).to.equal(setImmediate);
        });
    });

    describe('get', () => {
        beforeEach(() => {
            sinon.spy(dataLoader, 'buildCacheKey');
            sinon.spy(dataLoader, 'schedule');
            sinon.spy(dataLoader, 'dispatch');
            sinon.spy(dataLoader.cache, 'get');
            sinon.spy(dataLoader.cache, 'set');
        });

        afterEach(() => {
            dataLoader.buildCacheKey.restore();
            dataLoader.schedule.restore();
            dataLoader.dispatch.restore();
            dataLoader.cache.get.restore();
            dataLoader.cache.set.restore();
        });

        it('shoulds call buildCacheKey', done => {
            dataLoader.get(0, 'prefix.')
                .subscribe(() => {
                    expect(dataLoader.buildCacheKey).to.have.been.calledWith(0, 'prefix.');
                }, null, done);
        });

        it('shoulds consult cache', done => {
            dataLoader.get(0, 'prefix.')
                .subscribe(() => {
                    expect(dataLoader.cache.get).to.have.been.calledWith('prefix.0');
                }, null, done);
        });

        it('shoulds not consult cache if no args', done => {
            dataLoader.get()
                .subscribe(() => {
                    expect(dataLoader.cache.get).not.to.have.been.called;
                }, null, done);
        });

        it('shoulds returns', done => {
            dataLoader.get(0, 'prefix.')
                .pipe(
                    rx.merge(dataLoader.get(0, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.toArray()
                )
                .subscribe(response => {
                    expect(response).to.deep.equal([0, 0, 1, 1]);
                }, null, done);
        });

        it('shoulds call loader', done => {
            dataLoader.get(0, 'prefix.')
                .pipe(
                    rx.merge(dataLoader.get(0, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.toArray()
                )
                .subscribe(response => {
                    expect(loader).to.have.been.callCount(2);
                    expect(loader).to.have.been.calledWith(0);
                    expect(loader).to.have.been.calledWith(1);
                }, null, done);
        });

        it('shoulds returns different Observables if different keys', () => {
            expect(dataLoader.get(0, 'prefix.')).not.to.equal(dataLoader.get(1, 'prefix.'));
        });

        it('shoulds returns cached Observables if same key', () => {
            expect(dataLoader.get(0, 'prefix.')).to.equal(dataLoader.get(0, 'prefix.'));
        });

        it('shoulds set cache if not exists', done => {
            dataLoader.get(0, 'prefix.')
                .subscribe(() => {
                    expect(dataLoader.cache.set).to.have.been.calledOnce;
                    expect(dataLoader.cache.set).to.have.been.calledWith('prefix.0');
                }, null, done);
        });

        it('shoulds not set cache if no args', done => {
            dataLoader.get()
                .subscribe(() => {
                    expect(dataLoader.cache.set).not.to.have.been.called;
                }, null, done);
        });

        it('shoulds not set cache if exists', done => {
            dataLoader.get(0, 'prefix.')
                .pipe(
                    rx.merge(dataLoader.get(0, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.toArray()
                )
                .subscribe(() => {
                    expect(dataLoader.cache.set).to.have.been.calledTwice;
                    expect(dataLoader.cache.set).to.have.been.calledWith('prefix.0');
                    expect(dataLoader.cache.set).to.have.been.calledWith('prefix.1');
                }, null, done);
        });

        it('shoulds call schedule when queue goes from 0 to 1', done => {
            dataLoader.get(0, 'prefix.')
                .pipe(
                    rx.merge(dataLoader.get(0, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.toArray()
                )
                .subscribe(() => {
                    expect(dataLoader.schedule).to.have.been.calledOnce;
                }, null, done);
        });

        it('shoulds call dispatch when queue goes from 0 to 1', done => {
            dataLoader.get(0, 'prefix.')
                .pipe(
                    rx.merge(dataLoader.get(0, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.toArray()
                )
                .subscribe(() => {
                    expect(dataLoader.dispatch).to.have.been.calledOnce;
                }, null, done);
        });
    });

    describe('multiGet', () => {
        beforeEach(() => {
            sinon.spy(dataLoader, 'schedule');
            sinon.spy(dataLoader, 'dispatch');
        });

        afterEach(() => {
            dataLoader.schedule.restore();
            dataLoader.dispatch.restore();
        });

        it('shoulds returns', done => {
            dataLoader.multiGet(0)
                .pipe(
                    rx.merge(dataLoader.multiGet(0)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.toArray()
                )
                .subscribe(response => {
                    expect(response).to.deep.equal([0, 0, 1, 1]);
                }, null, done);
        });

        it('shoulds returns with args array', done => {
            dataLoader.multiGet([0, 0, 1, 1])
                .subscribe(response => {
                    expect(response).to.deep.equal([0, 0, 1, 1]);
                }, null, done);
        });

        it('shoulds returns with objects args', done => {
            dataLoader.multiGet({
                    id: 0
                })
                .pipe(
                    rx.merge(dataLoader.multiGet({
                        id: 0
                    })),
                    rx.merge(dataLoader.multiGet({
                        id: 1
                    })),
                    rx.merge(dataLoader.multiGet({
                        id: 1
                    })),
                    rx.toArray()
                )
                .subscribe(response => {
                    expect(response).to.deep.equal([{
                        id: 0
                    }, {
                        id: 0
                    }, {
                        id: 1
                    }, {
                        id: 1
                    }]);
                }, null, done);
        });

        it('shoulds empty argsCollection', done => {
            dataLoader.multiGet(0)
                .pipe(
                    rx.merge(dataLoader.multiGet(0)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.toArray()
                )
                .subscribe(() => {
                    expect(dataLoader.argsCollection).to.deep.equal([]);
                }, null, done);
        });

        it('shoulds call loader once', done => {
            dataLoader.multiGet(0)
                .pipe(
                    rx.merge(dataLoader.multiGet(0)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.toArray()
                )
                .subscribe(response => {
                    expect(loader).to.have.been.calledOnce;
                    expect(loader).to.have.been.calledWith([0, 1]);
                }, null, done);
        });
        
        it('shoulds call loader twice', done => {
            dataLoader.multiGet(0)
                .pipe(
                    rx.mergeMap(() => {
                        return dataLoader.multiGet(1);
                    }),
                    rx.toArray()
                )
                .subscribe(response => {
                    expect(loader).to.have.been.calledTwice;
                    expect(loader).to.have.been.calledWith([0]);
                    expect(loader).to.have.been.calledWith([1]);
                }, null, done);
        });

        it('shoulds call loader once with args array', done => {
            dataLoader.multiGet([0, 0, 1, 1])
                .subscribe(response => {
                    expect(loader).to.have.been.calledOnce;
                    expect(loader).to.have.been.calledWith([0, 1]);
                }, null, done);
        });

        it('shoulds call schedule once', done => {
            dataLoader.multiGet(0)
                .pipe(
                    rx.merge(dataLoader.multiGet(0)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.toArray()
                )
                .subscribe(() => {
                    expect(dataLoader.schedule).to.have.been.calledOnce;
                }, null, done);
        });

        it('shoulds call schedule once with args array', done => {
            dataLoader.multiGet([0, 0, 1, 1])
                .subscribe(() => {
                    expect(dataLoader.schedule).to.have.been.calledOnce;
                }, null, done);
        });

        it('shoulds call dispatch once', done => {
            dataLoader.multiGet(0)
                .pipe(
                    rx.merge(dataLoader.multiGet(0)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.merge(dataLoader.multiGet(1)),
                    rx.toArray()
                )
                .subscribe(() => {
                    expect(dataLoader.dispatch).to.have.been.calledOnce;
                }, null, done);
        });

        it('shoulds call dispatch once with args array', done => {
            dataLoader.multiGet([0, 0, 1, 1])
                .subscribe(() => {
                    expect(dataLoader.dispatch).to.have.been.calledOnce;
                }, null, done);
        });
    });

    describe('schedule', () => {
        beforeEach(() => {
            sinon.spy(dataLoader, 'scheduler');
        });

        afterEach(() => {
            dataLoader.scheduler.restore();
        });

        it('shoulds call scheduler', () => {
            const fn = () => null;

            dataLoader.schedule(fn);
            expect(dataLoader.scheduler).to.have.been.calledWith(fn);
        });
    });

    describe('dispatch', () => {
        it('shoulds call loader one per different item on the queue', done => {
            dataLoader.get(0, 'prefix.')
                .pipe(
                    rx.merge(dataLoader.get(0, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.merge(dataLoader.get(1, 'prefix.')),
                    rx.toArray()
                )
                .subscribe(() => {
                    expect(loader).to.have.been.calledTwice;
                    expect(loader).to.have.been.calledWith(0);
                    expect(loader).to.have.been.calledWith(1);
                }, null, done);
        });
    });

    describe('buldCacheKey', () => {
        it('shoulds build cache key with primitives', () => {
            expect(dataLoader.buildCacheKey(0)).to.equal(0);
            expect(dataLoader.buildCacheKey('string')).to.equal('string');
            expect(dataLoader.buildCacheKey(true)).to.equal(true);
        });

        it('shoulds build cache key with objects', () => {
            expect(dataLoader.buildCacheKey(null)).to.equal('null');
            expect(dataLoader.buildCacheKey({
                id: 0
            })).to.equal(JSON.stringify({
                id: 0
            }));
        });

        it('shoulds build cache key with prefix', () => {
            expect(dataLoader.buildCacheKey({
                id: 0
            }, 'prefix.')).to.equal(`prefix.${JSON.stringify({
                id: 0
            })}`);
        });
    });

    describe('bdd with graphQl', () => {
        beforeEach(() => {
            getUser.resetHistory();
        });

        it('shoulds call getUser many times', done => {
            asyncGraph(query(0))
                .subscribe(null, null, () => {
                    expect(getUser.callCount).to.equal(121);
                    done();
                });
        });

        it('shoulds call getUser once per user', done => {
            asyncGraph(query(0, true))
                .subscribe(null, null, () => {
                    expect(getUser.callCount).to.equal(4);
                    done();
                });
        });

        it('shoulds handle errors', done => {
            asyncGraph(query(4))
                .subscribe(null, err => {
                    expect(err.message).to.contains('no user id');
                    done();
                });
        });

        describe('many queries', () => {
            it('shoulds call many times', done => {
                asyncGraph(`{
                        u0: user(id: 0, useLoader: false) {
                            name
                            friends {
                                name
                            }
                        }
                        u1: user(id: 1, useLoader: false) {
                            name
                            friends {
                                name
                            }
                        }
                        u2: user(id: 2, useLoader: false) {
                            name
                            friends {
                                name
                            }
                        }
                        u3: user(id: 3, useLoader: false) {
                            name
                            friends {
                                name
                            }
                        }
                    }`)
                    .subscribe(null, null, () => {
                        expect(getUser.callCount).to.equal(16);
                        done();
                    });
            });

            it('shoulds call getUser once per user', done => {
                asyncGraph(`{
                        u0: user(id: 0, useLoader: true) {
                            name
                            friends {
                                name
                            }
                        }
                        u1: user(id: 1, useLoader: true) {
                            name
                            friends {
                                name
                            }
                        }
                        u2: user(id: 2, useLoader: true) {
                            name
                            friends {
                                name
                            }
                        }
                        u3: user(id: 3, useLoader: true) {
                            name
                            friends {
                                name
                            }
                        }
                    }`)
                    .subscribe(null, null, () => {
                        expect(getUser.callCount).to.equal(4);
                        done();
                    });
            });
        });
    });
});
