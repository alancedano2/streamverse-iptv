'use client';

import { useEffect, useState, useRef } from 'react';
import { Tv, Search, FolderHeart, Settings, Radio, PlayCircle } from 'lucide-react';
import Hls from 'hls.js';

interface Channel {
  id: string;
  name: string;
  group: string;
  logo: string;
  url: string;
}

interface EpgData {
  current: {
    title: string;
    desc: string;
    start: string;
    stop: string;
  };
  next: {
    title: string;
    start: string;
    stop: string;
  };
}

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos los canales');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [epg, setEpg] = useState<EpgData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingEpg, setLoadingEpg] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // 1. Cargar la lista de canales
  useEffect(() => {
    async function loadChannels() {
      try {
        const res = await fetch('/api/channels');
        const data: Channel[] = await res.json();
        setChannels(data);

        const uniqueGroups = Array.from(new Set(data.map((c) => c.group)));
        setCategories(['Todos los canales', ...uniqueGroups]);
        
        if (data.length > 0) {
          setActiveChannel(data[0]);
        }
      } catch (err) {
        console.error('Error cargando la interfaz:', err);
      } finally {
        setLoading(false);
      }
    }
    loadChannels();
  }, []);

  // 2. Cargar el EPG dinámico cada vez que cambie el canal activo
  useEffect(() => {
    if (!activeChannel) return;

    async function fetchEpg() {
      setLoadingEpg(true);
      try {
        const res = await fetch(`/api/epg?id=${encodeURIComponent(activeChannel.id)}`);
        const epgData = await res.json();
        setEpg(epgData);
      } catch (err) {
        console.error('Error cargando la guía de TV:', err);
      } finally {
        setLoadingEpg(false);
      }
    }

    fetchEpg();
    
    // Intervalo para actualizar la guía automáticamente cada 2 minutos
    const interval = setInterval(fetchEpg, 120000);
    return () => clearInterval(interval);
  }, [activeChannel]);

  // 3. Motor de reproducción HLS.js
  useEffect(() => {
    if (!activeChannel || !videoRef.current) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    const video = videoRef.current;
    const streamUrl = activeChannel.url;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((err) => console.log("Auto-play bloqueado:", err));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch((err) => console.log("Auto-play bloqueado:", err));
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [activeChannel]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0c0c0e]">
        <div className="text-xl font-medium tracking-wide text-zinc-400 animate-pulse">
          Cargando StreamVerse...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#0c0c0e] text-white overflow-hidden select-none">
      
      {/* ─── BARRA LATERAL IZQUIERDA ─── */}
      <aside className="w-16 h-full bg-[#121214] border-r border-zinc-800/40 flex flex-col items-center py-6 justify-between">
        <div className="flex flex-col items-center gap-8">
          <div className="text-cyan-500 font-black text-xl tracking-tighter">tv</div>
          <button className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg">
            <Search size={22} />
          </button>
          <button className="text-white bg-zinc-800 p-2 rounded-xl shadow-lg">
            <Tv size={22} />
          </button>
          <button className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg">
            <Radio size={22} />
          </button>
          <button className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg">
            <FolderHeart size={22} />
          </button>
        </div>
        <div>
          <button className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg">
            <Settings size={22} />
          </button>
        </div>
      </aside>

      {/* ─── PANEL DE CATEGORÍAS ─── */}
      <section className="w-64 h-full bg-[#16161a]/60 px-4 py-6 flex flex-col gap-4 border-r border-zinc-800/30">
        <h2 className="text-xs font-bold tracking-widest text-zinc-500 uppercase px-2">Categorías</h2>
        <div className="flex flex-col gap-1 overflow-y-auto pr-1 scrollbar-thin">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left px-4 py-3 rounded-xl font-medium text-[14px] transition-all ${
                selectedCategory === cat
                  ? 'bg-zinc-100 text-black font-semibold shadow-md translate-x-1'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* ─── CONTENEDOR PRINCIPAL DERECHO ─── */}
      <main className="flex-1 h-full flex flex-col overflow-hidden">
        
        {/* SECCIÓN SUPERIOR: REPRODUCTOR + INFO EPG COMPLETA */}
        <div className="w-full bg-black/40 border-b border-zinc-800/40 p-6 flex flex-col lg:flex-row gap-6 items-start">
          {/* Contenedor del video */}
          <div className="w-full lg:w-[440px] aspect-video bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex-shrink-0 relative">
            <video ref={videoRef} controls className="w-full h-full object-cover" poster={activeChannel?.logo} />
          </div>

          {/* Información y Bloque de Guía en Vivo */}
          {activeChannel && (
            <div className="flex-1 w-full flex flex-col justify-between self-stretch py-0.5">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {activeChannel.logo && (
                    <img src={activeChannel.logo} alt="" className="h-7 max-w-[60px] object-contain" />
                  )}
                  <h1 className="text-2xl font-bold tracking-tight text-white">{activeChannel.name}</h1>
                </div>
                
                {/* Detalles de lo que está dando AHORA MISMO */}
                <div className={`mt-3 transition-opacity ${loadingEpg ? 'opacity-50' : 'opacity-100'}`}>
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 tracking-wide uppercase mb-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    En Vivo {epg?.current?.start && epg?.current?.stop ? `(${epg.current.start} - ${epg.current.stop})` : ''}
                  </div>
                  <h2 className="text-lg font-bold text-zinc-100">{epg?.current?.title || 'Cargando programación...'}</h2>
                  <p className="text-sm text-zinc-400 mt-1 max-w-2xl line-clamp-2">{epg?.current?.desc}</p>
                </div>
              </div>

              {/* Lo que viene DESPUÉS (Próximo programa) */}
              {epg?.next && epg.next.title !== 'Programación Regular' && (
                <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center gap-3 text-sm text-zinc-400">
                  <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-medium flex-shrink-0">
                    Siguiente {epg.next.start ? `[${epg.next.start}]` : ''}
                  </span>
                  <span className="font-semibold text-zinc-300 truncate">{epg.next.title}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECCIÓN INFERIOR: LA GRILLA DE SELECCIÓN */}
        <div className="flex-1 p-6 flex flex-col overflow-hidden">
          <div className="text-sm text-zinc-500 font-medium mb-4 flex justify-between items-center">
            <span>{selectedCategory}</span>
            <span className="bg-zinc-800/60 text-zinc-300 text-xs px-2.5 py-1 rounded-full border border-zinc-700/30">
              {channels.filter(c => selectedCategory === 'Todos los canales' || c.group === selectedCategory).length} Canales
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {channels
                .filter((channel) => selectedCategory === 'Todos los canales' || channel.group === selectedCategory)
                .map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannel(channel)}
                    className={`flex items-center gap-4 border p-3.5 rounded-xl transition-all group text-left w-full outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                      activeChannel?.id === channel.id
                        ? 'bg-zinc-800/40 border-cyan-500/70 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                        : 'bg-[#121214] border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-800/20'
                    }`}
                  >
                    <div className="w-12 h-12 flex-shrink-0 bg-black/40 rounded-lg flex items-center justify-center p-1.5 border border-zinc-800/40">
                      {channel.logo ? (
                        <img src={channel.logo} alt="" className="max-w-full max-h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <div className="text-[10px] text-zinc-600 font-bold uppercase">TV</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className={`text-[14px] font-semibold truncate transition-colors ${
                        activeChannel?.id === channel.id ? 'text-cyan-400' : 'text-zinc-200 group-hover:text-white'
                      }`}>
                        {channel.name}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {activeChannel?.id === channel.id ? 'Transmitiendo ahora' : 'Ver canal'}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}