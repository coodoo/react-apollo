export { default as getDataFromTree, walkTree } from './getDataFromTree';
export * from './getDataFromTree';

export { default as ApolloConsumer } from './ApolloConsumer';
export * from './ApolloConsumer';

export { default as ApolloProvider } from './ApolloProvider';
export * from './ApolloProvider';

export { default as Query } from './Query';
export * from './Query';

export { default as Mutation } from './Mutation';
export * from './Mutation';

export { default as graphql } from './graphql';
export * from './graphql';

export { default as withApollo } from './withApollo';

export * from './types';

// XXX remove in the next breaking semver change (3.0)
const compose = require('lodash/flowRight');
export { compose };
