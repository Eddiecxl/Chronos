import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const token = () => localStorage.getItem('chronos-session-token-v1') || '';
const request = (path) => window.fetch(`${API_URL}${path}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
const streamUrl = (path) => `${API_URL}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token())}`;
const accountKey = (value) => String(value || '').trim().toLowerCase();

export default function FriendRadar({ username }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const centeredRef = useRef(false);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState('');
  const loadLocations = () => request(`/api/live-locations/${encodeURIComponent(username)}`).then((response) => response.ok ? response.json() : Promise.reject(response)).then((data) => { setLocations(data); setError(''); }).catch(() => setError('Friend radar is unavailable right now.'));

  useEffect(() => {
    if (mapRef.current || !elementRef.current) return undefined;
    const map = L.map(elementRef.current, { zoomControl: false, minZoom: 2, maxZoom: 19, worldCopyJump: true }).setView([18, 20], 2);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    loadLocations();
    const stream = new window.EventSource(streamUrl(`/api/events/${encodeURIComponent(username)}`));
    stream.onmessage = (event) => { const signal = JSON.parse(event.data); if (['location', 'presence', 'friend-removed'].includes(signal.type)) loadLocations(); };
    const timer = window.setInterval(loadLocations, 30000);
    return () => { stream.close(); window.clearInterval(timer); };
  }, [username]);

  useEffect(() => {
    const map = mapRef.current; const layer = markersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points = [];
    locations.forEach((account) => {
      const location = account.currentLocation;
      if (!location) return;
      const isMe = accountKey(account.username) === accountKey(username);
      const isLive = account.locationLive;
      const seenTime = new Date(location.updatedAt || account.lastSeen || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const statusText = isLive ? `${(account.presence || 'online').toUpperCase()} · LIVE NOW` : `LAST SEEN · ${seenTime}`;
      const icon = L.divIcon({ className: 'chronos-gps-marker-wrap', html: `<div class="gps-marker ${isLive ? 'live' : 'last'}${isMe ? ' me' : ''}"><span class="gps-pulse"></span><span class="gps-arrow"></span><div class="gps-tag"><b>${account.username}${isMe ? ' · YOU' : ''}</b><small>${statusText}</small></div></div>`, iconSize: [190, 64], iconAnchor: [16, 32] });
      const marker = L.marker([location.latitude, location.longitude], { icon, zIndexOffset: isLive ? 500 : 100 }).addTo(layer);
      marker.bindPopup(`<article class="chronos-map-popup"><span>${statusText}</span><b>${isMe ? `${account.username} · You` : account.username}</b><p>${location.accuracy ? `GPS accuracy approximately ±${Math.round(location.accuracy)} metres` : 'Last known browser location'}</p></article>`, { closeButton: false, offset: [0, -20] });
      points.push([location.latitude, location.longitude]);
    });
    if (!centeredRef.current && points.length) {
      centeredRef.current = true;
      points.length === 1 ? map.flyTo(points[0], 16, { duration: 1.3 }) : map.fitBounds(L.latLngBounds(points).pad(.45), { maxZoom: 15 });
    }
  }, [locations, username]);

  const meVisible = locations.some((account) => accountKey(account.username) === accountKey(username));
  return <section className="malaysia-map-section friend-radar"><header><div><span>FRIEND RADAR</span><h2>Your circle, when they choose to share.</h2><p>Live signals are visible only to approved friends. Last-known pins are muted.</p></div><b>{String(locations.filter((account) => account.locationLive).length).padStart(2, '0')} <small>LIVE NOW</small></b></header><div className="malaysia-map-shell"><div className="malaysia-map" ref={elementRef}/><div className="map-live-label"><i/><span>FRIENDS ONLY</span><b>PRIVATE CIRCLE RADAR</b></div>{!meVisible && <div className="map-empty-overlay"><span>⌖</span><b>No shared location yet</b><p>When you or a friend opts in, a signal will appear here.</p></div>}</div>{error && <p className="radar-error" role="status">{error}</p>}<footer><span>Location sharing is optional and can be stopped from Today.</span><b>Map data © OpenStreetMap contributors</b></footer></section>;
}
