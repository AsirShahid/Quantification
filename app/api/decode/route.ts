export const runtime = 'edge';

export async function POST(request: Request) {
  const serviceUrl = process.env.ANALYSIS_SERVICE_URL;
  if (!serviceUrl) {
    return Response.json(
      {
        error:
          'ND2 is available in the self-hosted installation. This private test site analyzes TIFF and JP2 in the browser; convert ND2 to OME-TIFF to test it here.',
      },
      { status: 501 },
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return Response.json({ error: 'Upload one ND2 file as multipart form data.' }, { status: 400 });
  }

  const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/decode`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: request.body,
    // @ts-expect-error duplex is required by Node fetch and ignored by Workers.
    duplex: 'half',
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
