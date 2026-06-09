import { NextResponse } from 'next/server';

// Exportación nombrada correcta para Next.js App Router
export async function GET() {
  try {
    const playlistUrl = 'http://m3u4u.com/m3u/68m7n45jveur4re9y1ge';
    
    const response = await fetch(playlistUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
      },
      // Cacheamos la lista por 5 minutos (300 segundos) para que vuele
      next: { revalidate: 300 } 
    });

    if (!response.ok) {
      throw new Error('No se pudo descargar la lista de M3U4U');
    }

    const m3uRawData = await response.text();
    const lines = m3uRawData.split('\n');
    const channels = [];
    let currentChannel: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        const groupMatch = line.match(/group-title="([^"]+)"/);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const idMatch = line.match(/tvg-id="([^"]+)"/);
        
        const commaIndex = line.lastIndexOf(',');
        const name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Canal sin nombre';

        let tvgId = idMatch ? idMatch[1] : '(no tvg-id)';
        if (tvgId === '(no tvg-id)') {
          tvgId = `gen-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        }

        currentChannel = {
          id: tvgId,
          name: name,
          group: groupMatch ? groupMatch[1] : 'Otros',
          logo: logoMatch ? logoMatch[1] : '',
        };
      } else if (line.startsWith('http') && currentChannel) {
        currentChannel.url = line;
        channels.push(currentChannel);
        currentChannel = null; 
      }
    }

    return NextResponse.json(channels);

  } catch (error: any) {
    console.error('Error en el parser de canales:', error);
    return NextResponse.json({ error: 'Error cargando canales' }, { status: 500 });
  }
}