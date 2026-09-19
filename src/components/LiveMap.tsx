import React, { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

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
  /** False for a small preview: no pan/zoom, no recenter button. Defaults to true. */
  interactive?: boolean;
  /** Fixed zoom for a single marker; higher is closer. Defaults to a ~300m box. */
  soloZoomDelta?: number;
}

// Leaflet + standard OpenStreetMap tiles, loaded from CDN inside a WebView —
// no API key, no account, no dev build (react-native-webview ships inside
// Expo Go, unlike react-native-maps / expo-maps which both require one).
// Tiles render in their natural light style: OSM's own cartography is the
// most legible option here, and a free provider-hosted dark style isn't
// dependable (CARTO's "dark_all" increasingly gates anonymous access, and
// when its tiles fail all you see is the page background). Markers carry a
// white halo so they stay readable against light streets.
// This is the "free tier" live map; swap the tile layer for Google Maps
// once that migration happens.
const MAP_HTML = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #EDEBE6; }
  .leaflet-control-attribution { font-size: 8px; background: rgba(255,255,255,0.7) !important; color: #6B7280 !important; }
  .leaflet-control-attribution a { color: #4B5563 !important; }
  .map-pin {
    display:flex; align-items:center; justify-content:center; border-radius:999px;
    box-shadow: 0 0 0 3px rgba(255,255,255,0.95), 0 2px 6px rgba(0,0,0,0.3);
  }
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
  var lastSoloDelta = 0.0015;
  // Auto-fit should get out of the user's way the moment they pan/zoom by
  // hand — otherwise the next marker update yanks the view back mid-gesture.
  // "programmatic" distinguishes our own fitBounds/setView calls (which also
  // fire dragstart/zoomstart) from a real user gesture.
  var userInteracted = false;
  var programmatic = false;

  map.on('dragstart zoomstart', function () {
    if (!programmatic) userInteracted = true;
  });

  function setInteractive(on) {
    ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard'].forEach(function (h) {
      if (!map[h]) return;
      if (on) { map[h].enable(); } else { map[h].disable(); }
    });
  }

  function fitToMarkers(markers, bottomInset) {
    if (!markers.length) return;
    var pts = markers.map(function (m) { return [m.lat, m.lng]; });
    var bounds;
    if (pts.length === 1) {
      var d = lastSoloDelta;
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
      html: '<div class="map-pin" style="width:' + size + 'px;height:' + size + 'px;background:' + conf.bg + ';font-size:' + Math.round(size * 0.55) + 'px;">' + conf.glyph + '</div>',
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
        if (typeof msg.soloDelta === 'number') lastSoloDelta = msg.soloDelta;
        setInteractive(msg.interactive !== false);
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
export function LiveMap({
  markers,
  style,
  bottomInset = 0,
  interactive = true,
  soloZoomDelta = 0.0015,
  children,
}: PropsWithChildren<LiveMapProps>) {
  const ref = useRef<WebView>(null);
  const readyRef = useRef(false);
  // Leaflet and the tiles come from a CDN. With no connection the WebView just
  // renders an empty light-grey box, which reads as "the map is loading"
  // forever rather than "you are offline".
  const [failed, setFailed] = useState(false);

  const send = () => {
    if (!readyRef.current) return;
    ref.current?.postMessage(
      JSON.stringify({ type: 'markers', markers, bottomInset, interactive, soloDelta: soloZoomDelta })
    );
  };

  useEffect(() => {
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, bottomInset, interactive, soloZoomDelta]);

  // Wrapped in a View so overlays and the recenter button anchor to the map
  // area itself rather than whatever ancestor happens to be positioned.
  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: MAP_HTML }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        mixedContentMode="always"
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        onLoadStart={() => setFailed(false)}
        onLoadEnd={() => {
          readyRef.current = true;
          send();
        }}
      />
      {failed && (
        <View style={styles.errorOverlay} pointerEvents="none">
          <Feather name="wifi-off" size={20} color={colors.textDim} />
          <Text style={styles.errorText}>Xəritə yüklənmədi — internet bağlantını yoxla</Text>
        </View>
      )}
      {children}
      {interactive && (
        <Pressable
          style={[styles.recenterBtn, { bottom: 16 + bottomInset }]}
          onPress={() => ref.current?.postMessage(JSON.stringify({ type: 'recenter' }))}
          accessibilityRole="button"
          accessibilityLabel="Xəritəni mərkəzləşdir"
        >
          <Feather name="crosshair" size={18} color={colors.amber} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the map page's own background so there's no dark flash while tiles load.
  wrap: { overflow: 'hidden', backgroundColor: '#EDEBE6' },
  web: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
  },
  errorText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim, textAlign: 'center' },
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
