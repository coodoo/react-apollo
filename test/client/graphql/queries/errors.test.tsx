import * as React from 'react';
import * as renderer from 'react-test-renderer';
import gql from 'graphql-tag';
import ApolloClient from 'apollo-client';
import { InMemoryCache as Cache } from 'apollo-cache-inmemory';
import { withState } from 'recompose';
import { mockSingleLink } from '../../../../src/test-utils';
import { ApolloProvider, graphql, ChildProps, Query, QueryResult } from '../../../../src';

import stripSymbols from '../../../test-utils/stripSymbols';
import { DocumentNode } from 'graphql';

describe('[queries] errors', () => {
  let error: typeof console.error;
  beforeEach(() => {
    error = console.error;
    console.error = jest.fn(() => {}); // tslint:disable-line
  });
  afterEach(() => {
    console.error = error;
  });

  // errors
  it('does not swallow children errors', done => {
    const query: DocumentNode = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;
    const data = { allPeople: { people: [{ name: 'Luke Skywalker' }] } };
    const link = mockSingleLink({
      request: { query },
      result: { data },
    });
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false }),
    });

    class ErrorBoundary extends React.Component {
      componentDidCatch(e: Error) {
        expect(e.message).toMatch(/bar is not a function/);
        done();
      }

      render() {
        return this.props.children;
      }
    }
    let bar: any;
    const ContainerWithData = graphql(query)(() => {
      bar(); // this will throw
      return null;
    });

    renderer.create(
      <ApolloProvider client={client}>
        <ErrorBoundary>
          <ContainerWithData />
        </ErrorBoundary>
      </ApolloProvider>,
    );
  });

  it('can unmount without error', done => {
    const query: DocumentNode = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;
    const data = { allPeople: { people: [{ name: 'Luke Skywalker' }] } };
    const link = mockSingleLink({
      request: { query },
      result: { data },
    });
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false }),
    });

    const ContainerWithData = graphql(query)(() => null);

    const wrapper = renderer.create(
      <ApolloProvider client={client}>
        <ContainerWithData />
      </ApolloProvider>,
    ) as any;

    try {
      wrapper.unmount();
      done();
    } catch (e) {
      throw new Error(e);
    }
  });

  it('passes any GraphQL errors in props', done => {
    const query: DocumentNode = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;
    const link = mockSingleLink({
      request: { query },
      error: new Error('boo'),
    });
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false }),
    });

    const ErrorContainer = graphql(query)(
      class extends React.Component<ChildProps> {
        componentWillReceiveProps({ data }: ChildProps) {
          expect(data!.error).toBeTruthy();
          expect(data!.error!.networkError).toBeTruthy();
          // expect(data.error instanceof ApolloError).toBeTruthy();
          done();
        }
        render() {
          return null;
        }
      },
    );

    renderer.create(
      <ApolloProvider client={client}>
        <ErrorContainer />
      </ApolloProvider>,
    );
  });

  describe('uncaught exceptions', () => {
    let unhandled: any[] = [];
    function handle(reason: any) {
      unhandled.push(reason);
    }
    beforeEach(() => {
      unhandled = [];
      process.on('unhandledRejection', handle);
    });
    afterEach(() => {
      process.removeListener('unhandledRejection', handle);
    });

    it('does not log when you change variables resulting in an error', done => {
      const query: DocumentNode = gql`
        query people($var: Int) {
          allPeople(first: $var) {
            people {
              name
            }
          }
        }
      `;
      const var1 = { var: 1 };
      const data = { allPeople: { people: { name: 'Luke Skywalker' } } };
      const var2 = { var: 2 };
      const link = mockSingleLink(
        {
          request: { query, variables: var1 },
          result: { data },
        },
        {
          request: { query, variables: var2 },
          error: new Error('boo'),
        },
      );
      const client = new ApolloClient({
        link,
        cache: new Cache({ addTypename: false }),
      });

      type Data = typeof data;
      type Vars = typeof var1;

      interface Props extends Vars {
        var: number;
        setVar: (val: number) => number;
      }

      let iteration = 0;
      const ErrorContainer = withState('var', 'setVar', 1)(
        graphql<Props, Data, Vars>(query)(
          class extends React.Component<ChildProps<Props, Data, Vars>> {
            componentWillReceiveProps(props: ChildProps<Props, Data, Vars>) {
              // tslint:disable-line
              iteration += 1;
              if (iteration === 1) {
                expect(stripSymbols(props.data!.allPeople)).toEqual(data.allPeople);
                props.setVar(2);
              } else if (iteration === 2) {
                expect(props.data!.loading).toBeTruthy();
              } else if (iteration === 3) {
                expect(props.data!.error).toBeTruthy();
                expect(props.data!.error!.networkError).toBeTruthy();
                // We need to set a timeout to ensure the unhandled rejection is swept up
                setTimeout(() => {
                  expect(unhandled.length).toEqual(0);
                  done();
                }, 0);
              }
            }
            render() {
              return null;
            }
          },
        ),
      );

      renderer.create(
        <ApolloProvider client={client}>
          <ErrorContainer />
        </ApolloProvider>,
      );
    });
  });

  it('will not log a warning when there is an error that is caught in the render method', () =>
    new Promise((resolve, reject) => {
      const query: DocumentNode = gql`
        query people {
          allPeople(first: 1) {
            people {
              name
            }
          }
        }
      `;

      interface Data {
        allPeople: {
          people: { name: string }[];
        };
      }
      const link = mockSingleLink({
        request: { query },
        error: new Error('oops'),
      });
      const client = new ApolloClient({
        link,
        cache: new Cache({ addTypename: false }),
      });

      const origError = console.error;
      const errorMock = jest.fn();
      console.error = errorMock;

      let renderCount = 0;
      @graphql<{}, Data>(query)
      class HandledErrorComponent extends React.Component<ChildProps<{}, Data>> {
        render(): React.ReactNode {
          try {
            switch (renderCount++) {
              case 0:
                expect(this.props.data!.loading).toEqual(true);
                break;
              case 1:
                expect(this.props.data!.error!.message).toEqual('Network error: oops');
                break;
              default:
                throw new Error('Too many renders.');
            }
          } catch (error) {
            console.error = origError;
            reject(error);
          }
          return null;
        }
      }

      renderer.create(
        <ApolloProvider client={client}>
          <HandledErrorComponent />
        </ApolloProvider>,
      );

      setTimeout(() => {
        try {
          expect(errorMock.mock.calls.length).toBe(0);
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          console.error = origError;
        }
      }, 20);
    }));

  it('will log a warning when there is an error that is not caught in the render method', () =>
    new Promise((resolve, reject) => {
      const query: DocumentNode = gql`
        query people {
          allPeople(first: 1) {
            people {
              name
            }
          }
        }
      `;

      interface Data {
        allPeople: {
          people: { name: string }[];
        };
      }

      const link = mockSingleLink({
        request: { query },
        error: new Error('oops'),
      });
      const client = new ApolloClient({
        link,
        cache: new Cache({ addTypename: false }),
      });

      const origError = console.error;
      const errorMock = jest.fn();
      console.error = errorMock;

      let renderCount = 0;
      @graphql<{}, Data>(query)
      class UnhandledErrorComponent extends React.Component<ChildProps<{}, Data>> {
        render(): React.ReactNode {
          try {
            switch (renderCount++) {
              case 0:
                expect(this.props.data!.loading).toEqual(true);
                break;
              case 1:
                // Noop. Don’t handle the error so a warning will be logged to the console.
                break;
              default:
                throw new Error('Too many renders.');
            }
          } catch (error) {
            console.error = origError;
            reject(error);
          }
          return null;
        }
      }

      renderer.create(
        <ApolloProvider client={client}>
          <UnhandledErrorComponent />
        </ApolloProvider>,
      );

      setTimeout(() => {
        try {
          expect(renderCount).toBe(2);
          expect(errorMock.mock.calls.length).toBe(1);
          expect(errorMock.mock.calls[0][0]).toEqual(
            'Unhandled (in react-apollo:Apollo(UnhandledErrorComponent))',
          );
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          console.error = origError;
        }
      }, 250);
    }));

  it('passes any cached data when there is a GraphQL error', done => {
    const query: DocumentNode = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;
    const data = { allPeople: { people: [{ name: 'Luke Skywalker' }] } };
    type Data = typeof data;
    const link = mockSingleLink(
      { request: { query }, result: { data } },
      { request: { query }, error: new Error('No Network Connection') },
    );
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false }),
    });

    let count = 0;
    const Container = graphql<{}, Data>(query, {
      options: { notifyOnNetworkStatusChange: true },
    })(
      class extends React.Component<ChildProps<{}, Data>> {
        componentWillReceiveProps(props: ChildProps<{}, Data>) {
          try {
            switch (count++) {
              case 0:
                expect(stripSymbols(props.data!.allPeople)).toEqual(data.allPeople);
                props.data!.refetch().catch(() => null);
                break;
              case 1:
                expect(props.data!.loading).toBeTruthy();
                expect(stripSymbols(props.data!.allPeople)).toEqual(data.allPeople);
                break;
              case 2:
                expect(props.data!.loading).toBeFalsy();
                expect(props.data!.error).toBeTruthy();
                expect(stripSymbols(props.data!.allPeople)).toEqual(data.allPeople);
                done();
                break;
              default:
                throw new Error('Unexpected fall through');
            }
          } catch (e) {
            done.fail(e);
          }
        }

        render() {
          return null;
        }
      },
    );

    renderer.create(
      <ApolloProvider client={client}>
        <Container />
      </ApolloProvider>,
    );
  });

  it('can refetch after there was a network error', done => {
    const query: DocumentNode = gql`
      query somethingelse {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;
    const data = { allPeople: { people: [{ name: 'Luke Skywalker' }] } };
    const dataTwo = { allPeople: { people: [{ name: 'Princess Leia' }] } };

    type Data = typeof data;
    const link = mockSingleLink(
      { request: { query }, result: { data } },
      { request: { query }, error: new Error('This is an error!') },
      { request: { query }, result: { data: dataTwo } },
    );
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false }),
    });

    let count = 0;
    const noop = () => null;
    const Container = graphql<{}, Data>(query, {
      options: { notifyOnNetworkStatusChange: true },
    })(
      class extends React.Component<ChildProps<{}, Data>> {
        componentWillReceiveProps(props: ChildProps<{}, Data>) {
          try {
            switch (count++) {
              case 0:
                props.data!
                  .refetch()
                  .then(() => {
                    done.fail('Expected error value on first refetch.');
                  })
                  .catch(noop);
                break;
              case 1:
                expect(props.data!.loading).toBeTruthy();
                break;
              case 2:
                expect(props.data!.loading).toBeFalsy();
                expect(props.data!.error).toBeTruthy();
                props.data!
                  .refetch()
                  .then(noop)
                  .catch(() => {
                    done.fail('Expected good data on second refetch.');
                  });
                break;
              // Further fix required in QueryManager
              // case 3:
              //   expect(props.data.loading).toBeTruthy();
              //   expect(props.data.error).toBeFalsy();
              //   break;
              case 3:
                expect(props.data!.loading).toBeFalsy();
                expect(props.data!.error).toBeFalsy();
                expect(stripSymbols(props.data!.allPeople)).toEqual(dataTwo.allPeople);
                done();
                break;
              default:
                throw new Error('Unexpected fall through');
            }
          } catch (e) {
            done.fail(e);
          }
        }

        render() {
          return null;
        }
      },
    );

    renderer.create(
      <ApolloProvider client={client}>
        <Container />
      </ApolloProvider>,
    );
  });
  describe('errorPolicy', () => {
    it('passes any GraphQL errors in props along with data', done => {
      const query: DocumentNode = gql`
        query people {
          allPeople(first: 1) {
            people {
              name
            }
          }
        }
      `;
      const link = mockSingleLink({
        request: { query },
        result: {
          data: {
            allPeople: {
              people: null,
            },
          },
          errors: [new Error('this is an error')],
        },
      });

      const client = new ApolloClient({
        link,
        cache: new Cache({ addTypename: false }),
      });

      const ErrorContainer = graphql(query, {
        options: { errorPolicy: 'all' },
      })(
        class extends React.Component<ChildProps> {
          componentWillReceiveProps({ data }: ChildProps) {
            expect(data!.error).toBeTruthy();
            expect(data!.error!.graphQLErrors[0].message).toEqual('this is an error');
            expect(data).toMatchObject({ allPeople: { people: null } });
            done();
          }
          render() {
            return null;
          }
        },
      );

      renderer.create(
        <ApolloProvider client={client}>
          <ErrorContainer />
        </ApolloProvider>,
      );
    });
    it('passes any GraphQL errors in props along with data [component]', done => {
      const query: DocumentNode = gql`
        query people {
          allPeople(first: 1) {
            people {
              name
            }
          }
        }
      `;
      const link = mockSingleLink({
        request: { query },
        result: {
          data: {
            allPeople: {
              people: null,
            },
          },
          errors: [new Error('this is an error')],
        },
      });

      const client = new ApolloClient({
        link,
        cache: new Cache({ addTypename: false }),
      });

      class ErrorContainer extends React.Component<QueryResult> {
        componentWillReceiveProps(props: QueryResult) {
          expect(props.error).toBeTruthy();
          expect(props.error!.graphQLErrors[0].message).toEqual('this is an error');
          expect(props.data!.allPeople!).toMatchObject({ people: null });
          done();
        }
        render() {
          return null;
        }
      }

      renderer.create(
        <ApolloProvider client={client}>
          <Query query={query} errorPolicy="all">
            {props => <ErrorContainer {...props} />}
          </Query>
        </ApolloProvider>,
      );
    });
  });
});
