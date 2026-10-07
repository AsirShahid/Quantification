'use client';
import { useEffect, useRef } from 'react';
import { renderPreview, type ChannelSettings } from './lib/channel-preview';
import type { AnalysisOptions, DecodedImage } from './lib/image-analysis';

export default function ChannelTile({ image, channel, ranges, settings, options, active, onSelect, view }: {
  image: DecodedImage; channel: 'red' | 'green' | 'blue'; ranges: number[];
  settings: ChannelSettings; options: AnalysisOptions; active: boolean; onSelect: () => void;
  view: 'original' | 'overlay' | 'mask';
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const available = image.channelCount >= ({ red: 1, green: 2, blue: 3 }[channel]) && image.channelCount > 1;
  useEffect(() => {
    if (!canvas.current || !available) return;
    const context = canvas.current.getContext('2d');
    const pixels = renderPreview(image, channel, ranges, [settings.brightness, settings.brightness, settings.brightness], { ...options, signalChannel: channel, minThreshold: settings.minimum, maxThreshold: settings.maximum }, view);
    context?.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  }, [image, channel, ranges, settings, options, view, available]);
  return <div className={`channel-tile ${active ? 'selected' : ''}`}>
    <button type="button" disabled={!available} onClick={onSelect}>{channel[0].toUpperCase() + channel.slice(1)}{active ? ' · editing' : ''}</button>
    <div className="channel-image">{available ? <canvas ref={canvas} width={image.width} height={image.height} aria-label={`${channel} channel preview`} /> : <span className="unavailable-channel">No {channel} source channel</span>}</div>
    {available && <small>{settings.minimum}–{settings.maximum}</small>}
  </div>;
}
