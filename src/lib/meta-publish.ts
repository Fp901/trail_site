// The owner's Post button (CLAUDE.md Part 18, migration 0024). Server only.
//
// Posts ONE approved draft to Instagram and the Facebook Page when the owner clicks Post at
// /admin/marketing (adminPublishDraft). Nothing else calls this: the agents' tool server has no
// publish tool, and the marketing runner never imports it.
//
// META_ACCESS_TOKEN (the never-expiring system-user token) and META_PAGE_ID live in the Vercel
// environment. The token is sent only to graph.facebook.com, in a header, and never returned or
// logged: every error is cleaned of it before it leaves this module.
//
// Meta fetches each photo from a public URL, so the caller passes absolute https URLs (site photos
// from the site itself, uploads as short-lived signed URLs).

const GRAPH = 'https://graph.facebook.com/v24.0';
const TIMEOUT_MS = 20_000;
// Carousel containers are processed by Meta before they can be published.
const READY_POLLS = 10;
const READY_WAIT_MS = 1_500;

type Json = Record<string, unknown>;

export interface PublishedPost {
  external_id: string;
  url: string | null;
}

export class MetaPublishError extends Error {}

export interface MetaCredentials {
  token: string;
  pageId: string;
}

export function metaCredentials(): MetaCredentials | null {
  const token = import.meta.env.META_ACCESS_TOKEN?.trim();
  const pageId = import.meta.env.META_PAGE_ID?.trim();
  return token && pageId ? { token, pageId } : null;
}

function clean(msg: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((m, s) => m.split(s).join('[token]'), msg).slice(0, 300);
}

async function call(method: 'GET' | 'POST', path: string, params: Record<string, string>, token: string): Promise<Json> {
  const url = new URL(`${GRAPH}/${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    init.body = new URLSearchParams(params);
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new MetaPublishError('Meta could not be reached. Please try again.');
  }
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const err = body.error as { message?: string; error_user_msg?: string } | undefined;
    throw new MetaPublishError(clean(err?.error_user_msg || err?.message || `Meta refused the request (${res.status}).`, [token]));
  }
  return body;
}

const idOf = (b: Json): string => {
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) throw new MetaPublishError('Meta did not return an id.');
  return id;
};

interface PageAccess {
  pageId: string;
  pageToken: string;
  igId: string | null;
}

const igOf = (b: Json): string | null => {
  const ig = b.instagram_business_account as Json | undefined;
  return typeof ig?.id === 'string' ? ig.id : null;
};

// Finds the Facebook Page, its token and its linked Instagram account.
// 1. META_PAGE_ID as given (the normal case with a system-user token).
// 2. If that id is not a Page (Meta: "nonexisting field (instagram_business_account)"), the Page the
//    token belongs to: a Page token answers /me as the Page itself.
// 3. Otherwise the Pages the token can manage (/me/accounts): the one matching META_PAGE_ID, or the
//    only one. More than one and no match is refused rather than guessed.
// A Page token has no access_token field to read, so the Page token is asked for on its own and the
// token itself is used when there is none to give.
async function pageAccess(c: MetaCredentials): Promise<PageAccess> {
  try {
    const page = await call('GET', c.pageId, { fields: 'instagram_business_account{id}' }, c.token);
    let pageToken = c.token;
    try {
      const t = await call('GET', c.pageId, { fields: 'access_token' }, c.token);
      if (typeof t.access_token === 'string') pageToken = t.access_token;
    } catch {
      // Already a Page token.
    }
    return { pageId: c.pageId, pageToken, igId: igOf(page) };
  } catch (e) {
    if (!(e instanceof MetaPublishError) || !/nonexisting field/i.test(e.message)) throw e;
  }
  try {
    const me = await call('GET', 'me', { fields: 'id,instagram_business_account{id}' }, c.token);
    if (typeof me.id === 'string') return { pageId: me.id, pageToken: c.token, igId: igOf(me) };
  } catch {
    // Not a Page token: look through the Pages it manages.
  }
  const list = await call('GET', 'me/accounts', { fields: 'id,access_token,instagram_business_account{id}' }, c.token);
  const pages = (Array.isArray(list.data) ? list.data : []) as Json[];
  const page = pages.find((p) => p.id === c.pageId) ?? (pages.length === 1 ? pages[0] : undefined);
  if (!page || typeof page.id !== 'string') {
    throw new MetaPublishError('META_PAGE_ID in Vercel is not your Facebook Page, and the token does not point to one Page. Set it to the Page ID from Business settings > Accounts > Pages.');
  }
  return { pageId: page.id, pageToken: typeof page.access_token === 'string' ? page.access_token : c.token, igId: igOf(page) };
}

async function waitUntilReady(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < READY_POLLS; i++) {
    const s = await call('GET', containerId, { fields: 'status_code' }, token);
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new MetaPublishError('Instagram could not process a photo. Check that each photo is a JPEG and not too tall or too wide.');
    }
    await new Promise((r) => setTimeout(r, READY_WAIT_MS));
  }
  throw new MetaPublishError('Instagram is still processing the photos. Please try again in a minute.');
}

// A single photo post or a carousel (2 to 10 photos), with the caption.
export async function publishInstagram(c: MetaCredentials, caption: string, imageUrls: string[]): Promise<PublishedPost> {
  const secrets = [c.token];
  try {
    const { igId } = await pageAccess(c);
    if (!igId) throw new MetaPublishError('No Instagram account is linked to the Facebook Page.');
    let containerId: string;
    if (imageUrls.length === 1) {
      containerId = idOf(await call('POST', `${igId}/media`, { image_url: imageUrls[0], caption }, c.token));
    } else {
      const children: string[] = [];
      for (const image_url of imageUrls) {
        children.push(idOf(await call('POST', `${igId}/media`, { image_url, is_carousel_item: 'true' }, c.token)));
      }
      containerId = idOf(await call('POST', `${igId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, c.token));
    }
    await waitUntilReady(containerId, c.token);
    const mediaId = idOf(await call('POST', `${igId}/media_publish`, { creation_id: containerId }, c.token));
    let url: string | null = null;
    try {
      const m = await call('GET', mediaId, { fields: 'permalink' }, c.token);
      url = typeof m.permalink === 'string' ? m.permalink : null;
    } catch {
      // The post is live; a missing link is not a failure.
    }
    return { external_id: mediaId, url };
  } catch (e) {
    throw e instanceof MetaPublishError ? new MetaPublishError(clean(e.message, secrets)) : new MetaPublishError('Instagram posting failed.');
  }
}

// A photo post (one photo) or a multi-photo post on the Facebook Page, with the text.
export async function publishFacebook(c: MetaCredentials, message: string, imageUrls: string[]): Promise<PublishedPost> {
  let pageToken = c.token;
  try {
    const access = await pageAccess(c);
    pageToken = access.pageToken;
    const pageId = access.pageId;
    let postId: string;
    if (imageUrls.length === 1) {
      const r = await call('POST', `${pageId}/photos`, { url: imageUrls[0], message, published: 'true' }, pageToken);
      postId = typeof r.post_id === 'string' ? r.post_id : idOf(r);
    } else {
      const media: string[] = [];
      for (const url of imageUrls) {
        media.push(idOf(await call('POST', `${pageId}/photos`, { url, published: 'false' }, pageToken)));
      }
      const params: Record<string, string> = { message };
      media.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
      postId = idOf(await call('POST', `${pageId}/feed`, params, pageToken));
    }
    return { external_id: postId, url: `https://www.facebook.com/${postId}` };
  } catch (e) {
    const secrets = [c.token, pageToken];
    throw e instanceof MetaPublishError ? new MetaPublishError(clean(e.message, secrets)) : new MetaPublishError('Facebook posting failed.');
  }
}
