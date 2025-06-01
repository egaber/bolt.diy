import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  if (new URL(request.url).pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
    return json({}, { status: 404 });
  }

  /*
   * If for some reason this loader is matched for other paths (it shouldn't with this filename)
   * throw a 404 to let Remix handle it with a boundary or other catch-all.
   */
  throw new Response('Not Found', { status: 404 });
}

export default function devtoolsJsonRoute() {
  return null; // This route is only for the loader
}
