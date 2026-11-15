// What one student's phone remembers between visits: the bag, the hold they
// made (code and email, so they can see or release it), and the items they
// asked to be told about. Per device conveniences in localStorage, wrapped so a
// private window or blocked storage never breaks the page. Nothing secret.

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the page still works for this visit */
  }
}

export const store = {
  bag: read("pl-bag", {}),            // { itemId: count }
  held: read("pl-held", null),        // { code, email, name, items, created_at, closes, place }
  following: read("pl-following", {}), // { itemId: "email" | "push" }
  me: read("pl-me", { name: "", email: "" }), // typed once, filled in next time

  setMe(name, email) {
    this.me = { name, email };
    write("pl-me", this.me);
  },

  setBag(id, n) {
    if (n > 0) this.bag[id] = n;
    else delete this.bag[id];
    write("pl-bag", this.bag);
  },
  clearBag() {
    this.bag = {};
    write("pl-bag", this.bag);
  },
  setHeld(held) {
    this.held = held;
    write("pl-held", held);
  },
  follow(id, channel) {
    this.following[id] = channel;
    write("pl-following", this.following);
  },
  unfollow(id) {
    delete this.following[id];
    write("pl-following", this.following);
  },
  bagLines() {
    return Object.keys(this.bag).length;
  },
};
