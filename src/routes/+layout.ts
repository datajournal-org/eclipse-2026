// Fully static: prerender the shell to HTML, ship to bunny.net. Dynamic content
// (location, countdown, maps) hydrates on the client.
export const prerender = true;

// Directory-style URLs (/eclipse-2026/en/), so every page is served as its own index.html. Static hosts
// serve directory indexes, not extensionless files.
export const trailingSlash = 'always';
