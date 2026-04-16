type HttpClient = {
  delete: (url: string) => Promise<unknown>;
  get: (url: string) => Promise<{ data: { data?: unknown[] } }>;
};

type RowWithId = {
  id?: string;
};

export async function verifySoftDelete(
  client: HttpClient,
  basePath: string,
  id: string,
) {
  await client.delete(`${basePath}/${id}`);
  console.log('Deleted');

  try {
    await client.get(`${basePath}/${id}`);
    console.log('Still accessible (FAIL)');
  } catch {
    console.log('Soft delete working (not found)');
  }

  const list = await client.get(basePath);
  const rows = Array.isArray(list.data.data) ? list.data.data : [];
  const exists = rows.find((item) => (item as RowWithId).id === id);

  if (exists) {
    console.log('Deleted item still in list');
  } else {
    console.log('Deleted item excluded from list');
  }
}
