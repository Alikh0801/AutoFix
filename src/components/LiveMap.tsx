import React, { useEffect, useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/colors';

export type LiveMapMarkerVariant = 'you' | 'usta' | 'destination';

export interface LiveMapMarker {
  id: string;
  lat: number;
  lng: number;
  variant: LiveMapMarkerVariant;
}

interface LiveMapProps {
  markers: LiveMapMarker[];
  style?: StyleProp<ViewStyle>;
  /** Extra bottom padding (px) so auto-fit keeps markers clear of an overlaid sheet/card. */
  bottomInset?: number;
}

// Leaflet + standard OpenStreetMap tiles, loaded from CDN inside a WebView —
// no API key, no account, no dev build (react-native-webview ships inside
// Expo Go, unlike react-native-maps / expo-maps which both require one).
// A CSS filter approximates a dark map instead of relying on a tile
// provider's own dark style, since those (e.g. CARTO's free "dark_all")
// increasingly gate anonymous access — when tiles fail to load there, all
// you see is the page's background colour, i.e. a solid black screen.
// This is the "free tier" live map; swap the tile layer for Google Maps
// once that migration happens.
const MAP_HTML = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #171B22; }
  .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9); }
  .leaflet-control-attribution { font-size: 8px; background: rgba(14,17,22,0.6) !important; color: #5B6570 !important; }
  .leaflet-control-attribution a { color: #93A0AC !important; }
  .jolt-pin { display:flex; align-items:center; justify-content:center; border-radius:999px; box-shadow: 0 0 0 3px rgba(0,0,0,0.35); }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([40.4093, 49.8671], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var markersById = {};
  var lastMarkers = [];
  var lastBottomInset = 0;
  // Auto-fit should get out of the user's way the moment they pan/zoom by
  // hand — otherwise the next marker update yanks the view back mid-gesture.
  // "programmatic" distinguishes our own fitBounds/setView calls (which also
  // fire dragstart/zoomstart) from a real user gesture.
  var userInteracted = false;
  var programmatic = false;

  map.on('dragstart zoomstart', function () {
    if (!programmatic) userInteracted = true;
  });

  function fitToMarkers(markers, bottomInset) {
    if (!markers.length) return;
    var pts = markers.map(function (m) { return [m.lat, m.lng]; });
    var bounds;
    if (pts.length === 1) {
      var d = 0.0015;
      bounds = L.latLngBounds([pts[0][0] - d, pts[0][1] - d], [pts[0][0] + d, pts[0][1] + d]);
    } else {
      bounds = L.latLngBounds(pts);
    }
    programmatic = true;
    map.fitBounds(bounds, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, 40 + (bottomInset || 0)],
      maxZoom: 16
    });
    setTimeout(function () { programmatic = false; }, 150);
  }

  function iconFor(variant) {
    var conf = {
      you: { bg: '#5FA8FF', glyph: '' },
      usta: { bg: '#FFB627', glyph: '\\uD83D\\uDD27' },
      destination: { bg: '#FF6B57', glyph: '\\uD83D\\uDCCD' }
    }[variant] || { bg: '#FFB627', glyph: '' };
    var size = variant === 'you' ? 20 : 32;
    return L.divIcon({
      className: '',
      html: '<div class="jolt-pin" style="width:' + size + 'px;height:' + size + 'px;background:' + conf.bg + ';font-size:' + Math.round(size * 0.55) + 'px;">' + conf.glyph + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function applyMarkers(markers, bottomInset) {
    lastMarkers = markers;
    lastBottomInset = bottomInset || 0;
    var seen = {};
    markers.forEach(function (m) {
      seen[m.id] = true;
      var ll = [m.lat, m.lng];
      if (markersById[m.id]) {
        markersById[m.id].setLatLng(ll);
      } else {
        markersById[m.id] = L.marker(ll, { icon: iconFor(m.variant) }).addTo(map);
      }
    });
    Object.keys(markersById).forEach(function (id) {
      if (!seen[id]) {
        map.removeLayer(markersById[id]);
        delete markersById[id];
      }
    });
    if (!userInteracted) fitToMarkers(markers, lastBottomInset);
  }

  function handleMessage(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'markers') {
        applyMarkers(msg.markers, msg.bottomInset);
      } else if (msg.type === 'recenter') {
        userInteracted = false;
        fitToMarkers(lastMarkers, lastBottomInset);
      }
    } catch (e) {}
  }
  document.addEventListener('message', handleMessage);
  window.addEventListener('message', handleMessage);
</script>
</body>
</html>`;

/** Real, free live map (Leaflet/OSM via WebView) — no API key, works in Expo Go. */
export function LiveMap({ markers, style, bottomInset = 0 }: LiveMapProps) {
  const ref = useRef<WebView>(null);
  const readyRef = useRef(false);

  const send = () => {
    if (!readyRef.current) return;
    ref.current?.postMessage(JSON.stringify({ type: 'markers', markers, bottomInset }));
  };

  useEffect(() => {
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, bottomInset]);

  return (
    <>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: MAP_HTML }}
        style={style}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        mixedContentMode="always"
        onLoadEnd={() => {
          readyRef.current = true;
          send();
        }}
      />
      <Pressable
        style={[styles.recenterBtn, { bottom: 16 + bottomInset }]}
        onPress={() => ref.current?.postMessage(JSON.stringify({ type: 'recenter' }))}
      >
        <Feather name="crosshair" size={18} color={colors.amber} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  recenterBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
