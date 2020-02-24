// this is temporary auth storage stub.
// TODO Implement a real auth storage
const USERS = {
  admin: {
    password: 'place-here-password-hash',
    isAdmin: true,
  },
  guest: {
    password: 'place-here-password-hash',
    isAdmin: false,
  },
};

export const getUser = login => USERS[login];
