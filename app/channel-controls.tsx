'use client';
import type { Channel, ChannelSettings } from './lib/channel-preview';

export default function ChannelControls({ channel, settings, limit, active, disabled, markerLabel, onSelect, onChange, onAuto }: {
  channel: Channel; settings: ChannelSettings; limit: number; active: boolean; disabled: boolean; markerLabel: string;
  onSelect: () => void; onChange: (next: ChannelSettings) => void; onAuto: () => void;
}) {
  const minimum = (value: string) => onChange({ ...settings, minimum: Math.max(0, Math.min(settings.maximum, Math.round(Number(value)))) });
  const maximum = (value: string) => onChange({ ...settings, maximum: Math.min(limit, Math.max(settings.minimum, Math.round(Number(value)))) });
  return <fieldset className={`channel-settings-card ${active ? 'active' : ''}`} disabled={disabled}>
    <legend className="sr-only">{channel} channel settings</legend>
    <button type="button" className="channel-settings-title" data-channel={channel} aria-pressed={active} onClick={onSelect}>{channel[0].toUpperCase() + channel.slice(1)}{active ? ' · selected' : ''}</button>
    {markerLabel && <span className="channel-marker">{markerLabel}</span>}
    <div className="channel-threshold-pair">
      <label htmlFor={`${channel}-minimum`}>Minimum
        <input id={`${channel}-minimum`} aria-label={`${channel} minimum threshold`} type="number" min="0" max={settings.maximum} step="1" value={settings.minimum} onChange={(event) => minimum(event.target.value)} />
        <input aria-label={`${channel} minimum threshold slider`} type="range" min="0" max={limit} step="1" value={settings.minimum} onChange={(event) => minimum(event.target.value)} />
      </label>
      <label htmlFor={`${channel}-maximum`}>Maximum
        <input id={`${channel}-maximum`} aria-label={`${channel} maximum threshold`} type="number" min={settings.minimum} max={limit} step="1" value={settings.maximum} onChange={(event) => maximum(event.target.value)} />
        <input aria-label={`${channel} maximum threshold slider`} type="range" min="0" max={limit} step="1" value={settings.maximum} onChange={(event) => maximum(event.target.value)} />
      </label>
    </div>
    <label className="channel-brightness-label" htmlFor={`${channel}-brightness`}>Brightness <span>{settings.brightness.toFixed(1)}×</span>
      <input id={`${channel}-brightness`} aria-label={`${channel} brightness`} type="range" min="0.2" max="3" step="0.1" value={settings.brightness} onChange={(event) => onChange({ ...settings, brightness: Number(event.target.value) })} />
    </label>
    <div className="channel-settings-footer"><span>Range: 0–{limit}</span><button type="button" onClick={onAuto} aria-label={`Auto ${channel} settings`}>Auto</button></div>
  </fieldset>;
}
