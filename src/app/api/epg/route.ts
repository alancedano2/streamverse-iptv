import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tvgId = searchParams.get('id');

    if (!tvgId) {
      return NextResponse.json({ error: 'Falta el parámetro id (tvg-id)' }, { status: 400 });
    }

    // URL del XMLTV de tu M3U4U
    const epgUrl = 'http://m3u4u.com/xml/68m7n45jveur4re9y1ge';
    const response = await fetch(epgUrl, {
      method: 'GET',
      next: { revalidate: 900 } // Cache de 15 minutos para que vuele
    });

    if (!response.ok) {
      throw new Error('No se pudo descargar el XMLTV de M3U4U');
    }

    const xmlRawData = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    const jsonObj = parser.parse(xmlRawData);

    if (!jsonObj.tv || !jsonObj.tv.programme) {
      return NextResponse.json({ current: null, next: null });
    }

    const allProgrammes = Array.isArray(jsonObj.tv.programme) 
      ? jsonObj.tv.programme 
      : [jsonObj.tv.programme];

    // Buscamos ignorando mayúsculas/minúsculas para evitar errores con WKAQDT.pr
    const channelPrograms = allProgrammes.filter(
      (p: any) => p.channel && p.channel.toLowerCase() === tvgId.toLowerCase()
    );

    // Reloj actual para comparar bloques de tiempo
    const now = new Date();
    const formatXMLTVDate = (d: Date) => d.toISOString().replace(/[-T:.Z]/g, '').substring(0, 14);
    const currentTimeStr = formatXMLTVDate(now);

    let currentProg: any = null;
    let nextProg: any = null;

    const cleanTime = (timeStr: string) => {
      if (!timeStr) return '';
      const hh = timeStr.substring(8, 10);
      const mm = timeStr.substring(10, 12);
      return `${hh}:${mm}`;
    };

    for (let i = 0; i < channelPrograms.length; i++) {
      const p = channelPrograms[i];
      const start = p.start?.substring(0, 14);
      const stop = p.stop?.substring(0, 14);

      if (currentTimeStr >= start && currentTimeStr <= stop) {
        currentProg = {
          title: p.title?.['#text'] || p.title || 'Programación Regular',
          desc: p.desc?.['#text'] || p.desc || 'Sin descripción disponible.',
          start: cleanTime(p.start),
          stop: cleanTime(p.stop),
        };
        
        const next = channelPrograms[i + 1];
        if (next) {
          nextProg = {
            title: next.title?.['#text'] || next.title || 'Programación Regular',
            start: cleanTime(next.start),
            stop: cleanTime(next.stop),
          };
        }
        break;
      }
    }

    return NextResponse.json({
      current: currentProg || { title: 'Sin información', desc: 'No hay guía disponible en este bloque.', start: '--:--', stop: '--:--' },
      next: nextProg || { title: 'Programación Regular', start: '--:--', stop: '--:--' }
    });

  } catch (error: any) {
    console.error('Error en el motor EPG:', error);
    return NextResponse.json({ error: 'Error procesando la guía de TV' }, { status: 500 });
  }
}