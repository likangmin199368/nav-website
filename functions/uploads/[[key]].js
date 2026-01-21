export const onRequestGet = async (c) => {
  const key = c.params?.key;
  if (!key) {
    return new Response('Not Found', { status: 404 });
  }
  if (!c.env.UPLOADS) {
    return new Response('UPLOADS binding not configured', { status: 500 });
  }

  const object = await c.env.UPLOADS.get(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers();
  if (object.httpMetadata?.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType);
  }
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
};
