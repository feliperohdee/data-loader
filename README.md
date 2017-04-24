[![CircleCI](https://circleci.com/gh/feliperohdee/smallorange-data-loader.svg?style=svg)](https://circleci.com/gh/feliperohdee/smallorange-data-loader)

# Small Orange Data Loader

This package create batched queries to avoid make duplicate requests to the backend. The sample below is self explanatory (we reduce 121 queries to just 4 using this package): 

## Usage with GraphQL

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

		const getUser = sinon.spy(id => Observable.create(subscriber => {
		    if (!users[id]) {
		        subscriber.error(new Error('no user id'));
		    }

		    subscriber.next(users[id]);
		    subscriber.complete();
		}).share());

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

		                return Observable.from(friendsOf[id])
		                    .mergeMap(id => userLoader ? userLoader.get(id) : getUser(id))
		                    .toArray()
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
		                        const userLoader = context.userLoader = new DataLoader(getUser);

		                        return userLoader.get(id)
		                            .toPromise();
		                    }

		                    return getUser(id)
		                        .toPromise();
		                }
		            }
		        }
		    })
		});

		const asyncGraph = requestString => Observable.fromPromise(graphql(schema, requestString, {}, {}))
		    .do(response => {
		        if (response.errors) {
		            throw new Error(response.errors.join());
		        }
		    });

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

		asyncGraph(query(0))
                .subscribe(null, null, () => {
                    // getUser will be called 121 times
                });

		asyncGraph(query(0, true))
                .subscribe(null, null, () => {
                    // getUser will be called 4 times, once per user ;)
                });
