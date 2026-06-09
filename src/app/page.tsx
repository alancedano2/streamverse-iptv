'use client';

import { useEffect, useState, useRef } from 'react';
import { Tv, Search, FolderHeart, Settings, Radio } from 'lucide-react';
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
  
  // Estados para controlar qué elemento tiene el "Foco" del control remoto
  const [focusedSection, setFocusedSection] = useState<'categories' | 'channels'>('categories');
  const [focusedCategoryIdx, setFocusedCategoryIdx] = useState<number>(0);
  const [focusedChannelIdx, setFocusedChannelIdx] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Filtrar canales según la categoría elegida
  const filteredChannels = channels.filter(
    (c) => selectedCategory === 'Todos los canales' || c.group === selectedCategory
  );

  // 1. Cargar canales desde tu API en Vercel
  useEffect(() => {
    async function loadChannels() {
      try {
        const res = await fetch('https://streamverse-iptv.vercel.app/api/channels');
        const data: Channel[] = await res.json();
        setChannels(data);

        const uniqueGroups = Array.from(new Set(data.map((c) => c.group)));
        const allCats = ['Todos los canales', ...uniqueGroups];
        setCategories(allCats);
        
        if (data.length > 0) {
          setActiveChannel(data[0]);
        }
      } catch (err) {
        console.error('Error cargando los canales:', err);
      } finally {
        setLoading(false);
      }
    }
    loadChannels();
  }, []);

  // 2. Cargar el EPG dinámico protegiendo contra nulos para TypeScript
  useEffect(() => {
    if (!activeChannel) return;

    async function fetchEpg() {
      if (!activeChannel) return; 
      
      setLoadingEpg(true);
      try {
        const channelId = activeChannel.id;
        const res = await fetch(`https://streamverse-iptv.vercel.app/api/epg?id=${encodeURIComponent(channelId)}`);
        const epgData = await res.json();
        setEpg(epgData);
      } catch (err) {
        console.error('Error cargando la guía de TV:', err);
      } finally {
        setLoadingEpg(false);
      }
    }

    fetchEpg();
    
    // Auto-update de guía cada 2 minutos
    const interval = setInterval(fetchEpg, 120000);
    return () => clearInterval(interval);
  }, [activeChannel]);

  // 3. ESCUCHA DE TECLAS INTERNA (Soporte para D-Pad de Control Remoto / Flechas de Teclado)
  useEffect(() => {
    if (loading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (focusedSection === 'categories') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedCategoryIdx((prev) => Math.min(prev + 1, categories.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedCategoryIdx((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (filteredChannels.length > 0) {
            setFocusedSection('channels');
            setFocusedChannelIdx(0);
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setSelectedCategory(categories[focusedCategoryIdx]);
        }
      } 
      else if (focusedSection === 'channels') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          // Grilla de 5 columnas: bajar significa saltar 5 posiciones
          setFocusedChannelIdx((prev) => Math.min(prev + 5, filteredChannels.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedChannelIdx((prev) => Math.max(prev - 5, 0));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          // Si estás en la primera columna de la grilla, regresas a la lista de categorías
          if (focusedChannelIdx % 5 === 0) {
            setFocusedSection('categories');
          } else {
            setFocusedChannelIdx((prev) => Math.max(prev - 1, 0));
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setFocusedChannelIdx((prev) => Math.min(prev + 1, filteredChannels.length - 1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setActiveChannel(filteredChannels[focusedChannelIdx]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedSection, focusedCategoryIdx, focusedChannelIdx, categories, filteredChannels, loading]);

  // Sincronizar el cambio visual al navegar categorías con el control remoto
  useEffect(() => {
    if (categories[focusedCategoryIdx]) {
      setSelectedCategory(categories[focusedCategoryIdx]);
    }
  }, [focusedCategoryIdx, categories]);

  // 4. Motor de Video HLS.js
  useEffect(() => {
    if (!activeChannel || !videoRef.current) return;
    if (hlsRef.current) hlsRef.current.destroy();

    const video = videoRef.current;
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(activeChannel.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { 
        video.play().catch(() => console.log("Auto-play bloqueado por políticas del navegador")); 
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeChannel.url;
      video.addEventListener('loadedmetadata', () => { 
        video.play().catch(() => console.log("Auto-play bloqueado")); 
      });
    }
    return () => { if (hlsRef.current) hlsRef.current.destroy(); };
  }, [activeChannel]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0c0c0e]">
        <div className="text-xl font-medium text-zinc-400 animate-pulse">Cargando StreamVerse...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#0c0c0e] text-white overflow-hidden select-none">
      
      {/* ─── BARRA LATERAL ULTRA DECORATIVA ─── */}
      <aside className="w-16 h-full bg-[#121214] border-r border-zinc-800/40 flex flex-col items-center py-6 justify-between">
        <div className="flex flex-col items-center gap-8">
          <div className="text-cyan-500 font-black text-xl tracking-tighter">tv</div>
          <button className="text-zinc-500 p-2"><Search size={22} /></button>
          <button className="text-white bg-zinc-800 p-2 rounded-xl"><Tv size={22} /></button>
          <button className="text-zinc-500 p-2"><Radio size={22} /></button>
          <button className="text-zinc-500 p-2"><FolderHeart size={22} /></button>
        </div>
      </aside>

      {/* ─── PANEL DE CATEGORÍAS (ENFOQUE DE CONTROL REMOTO) ─── */}
      <section className="w-64 h-full bg-[#16161a]/60 px-4 py-6 flex flex-col gap-4 border-r border-zinc-800/30">
        <h2 className="text-xs font-bold tracking-widest text-zinc-500 uppercase px-2">Categorías</h2>
        <div className="flex flex-col gap-1 overflow-y-auto pr-1 scrollbar-none">
          {categories.map((cat, idx) => {
            const isFocused = focusedSection === 'categories' && focusedCategoryIdx === idx;
            const isSelected = selectedCategory === cat;
            return (
              <div
                key={cat}
                className={`w-full text-left px-4 py-3 rounded-xl font-medium text-[14px] transition-all duration-150 ${
                  isFocused 
                    ? 'bg-cyan-500 text-black font-bold scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.4)]' 
                    : isSelected
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'text-zinc-400'
                }`}
              >
                {cat}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── CONTENEDOR CENTRAL (REPRODUCTOR + GRID CANALES) ─── */}
      <main className="flex-1 h-full flex flex-col overflow-hidden">
        
        {/* Módulo del Reproductor Superior */}
        <div className="w-full bg-black/40 border-b border-zinc-800/40 p-6 flex flex-col lg:flex-row gap-6 items-start">
          <div className="w-full lg:w-[400px] aspect-video bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 flex-shrink-0 relative shadow-2xl">
            <video ref={videoRef} controls className="w-full h-full object-cover" poster={activeChannel?.logo || ''} />
          </div>
          {activeChannel && (
            <div className="flex-1 py-1 w-full flex flex-col justify-between self-stretch">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {activeChannel.logo && (
                    <img src={activeChannel.logo} alt="" className="h-7 max-w-[60px] object-contain" />
                  )}
                  <h1 className="text-2xl font-bold tracking-tight text-white">{activeChannel.name}</h1>
                </div>
                
                <div className={`mt-3 transition-opacity ${loadingEpg ? 'opacity-50' : 'opacity-100'}`}>
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 tracking-wide uppercase mb-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    {epg?.current?.start ? `En Vivo (${epg.current.start} - ${epg.current.stop})` : 'En directo'}
                  </div>
                  <h2 className="text-lg font-bold text-zinc-100">{epg?.current?.title || 'Programación Regular'}</h2>
                  <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{epg?.current?.desc || 'No hay descripción disponible para esta transmisión.'}</p>
                </div>
              </div>

              {epg?.next && epg.next.title !== 'Programación Regular' && (
                <div className="mt-4 pt-3 border-t border-zinc-800/40 flex items-center gap-3 text-sm text-zinc-400">
                  <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-medium">
                    Siguiente [{epg.next.start}]
                  </span>
                  <span className="font-semibold text-zinc-300 truncate">{epg.next.title}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Módulo de la Cuadrícula Inferior */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          <div className="text-sm text-zinc-500 font-medium mb-4 flex justify-between items-center">
            <span>{selectedCategory}</span>
            <span className="bg-zinc-800/60 text-zinc-300 text-xs px-2.5 py-1 rounded-full border border-zinc-700/30">
              {filteredChannels.length} Canales
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
            <div className="grid grid-cols-5 gap-3">
              {filteredChannels.map((channel, idx) => {
                const isFocused = focusedSection === 'channels' && focusedChannelIdx === idx;
                const isActive = activeChannel?.id === channel.id;
                return (
                  <div
                    key={channel.id}
                    className={`flex items-center gap-4 border p-3.5 rounded-xl transition-all duration-150 ${
                      isFocused
                        ? 'bg-zinc-100 text-black border-cyan-400 scale-[1.03] font-bold shadow-2xl'
                        : isActive
                          ? 'bg-zinc-800/60 border-cyan-500/50 text-cyan-400'
                          : 'bg-[#121214] border-zinc-800/60 text-zinc-200'
                    }`}
                  >
                    <div className="w-10 h-10 flex-shrink-0 bg-black/20 rounded-lg flex items-center justify-center p-1 border border-zinc-800/30">
                      {channel.logo ? (
                        <img src={channel.logo} alt="" className="max-w-full max-h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <div className="text-[9px] text-zinc-600 font-bold">TV</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-sm font-semibold truncate">
                      {channel.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
