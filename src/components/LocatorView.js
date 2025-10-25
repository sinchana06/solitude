import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import mqtt from 'mqtt';

export default function LocatorView({
    brokerUrl,
    topic,
    maxPoints = 2000,       // trail buffer size for rendering
    boxSize = 10,
    simulate = false,
    maxSavedPoints = 10000, // how many raw points to keep for export/hover
}) {
    const mountRef = useRef(null);
    const mqttClientRef = useRef(null);
    const animationRef = useRef(null);
    const trailIndexRef = useRef(0);
    const pointsCountRef = useRef(0);
    const positionsRef = useRef(null);
    // --- follow & zoom controls (paste near other refs / state)
    const cameraDistanceRef = useRef(Math.max(boxSize * 1.2, 10));
    const followGridRef = useRef(null);
    const [followGridOn, setFollowGridOn] = useState(true);
    // show last hovered coordinate (raw coords)
    const [hoveredCoords, setHoveredCoords] = useState(null);
    // zoom helpers (adjust factors to taste)
    const zoomIn = () => { cameraDistanceRef.current = Math.max(1, cameraDistanceRef.current * 0.78); };
    const zoomOut = () => { cameraDistanceRef.current = cameraDistanceRef.current * 1.25; };
    const resetZoom = () => { cameraDistanceRef.current = Math.max(boxSize * 1.2, 10); };
    // persistent origin and scale
    const originRef = useRef(null); // first received raw coordinate
    const visualScaleRef = useRef(1.0); // tune: raw units -> scene units

    // three objects refs for use by handlers outside useEffect
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);

    // stored history (raw coords + scaled scene coords)
    const coordHistoryRef = useRef([]); // each item: {x,y,z,timestamp, sx,sy,sz}
    const [historyCount, setHistoryCount] = useState(0);

    // tooltip state for hover
    const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });

    const [running, setRunning] = useState(true);
    const [connected, setConnected] = useState(false);
    const [subscribed, setSubscribed] = useState(false);

    // --- Three.js setup
    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('black');

        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.set(boxSize * 1.2, boxSize * 1.2, boxSize * 1.2);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        rendererRef.current = renderer;

        // initial sizing and append
        const handleResize = () => {
            const w = mount.clientWidth || 1;
            const h = mount.clientHeight || 1;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };

        // mount renderer
        mount.appendChild(renderer.domElement);
        // make canvas fill parent
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';

        // ResizeObserver to follow parent size changes
        const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(handleResize) : null;
        if (ro) ro.observe(mount);
        // initial size
        handleResize();

        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(5, 10, 7);
        scene.add(dir);

        const gridSize = Math.max(boxSize, 50); // increase if you want even larger
        const gridDivisions = Math.max(24, Math.floor(gridSize / 50));
        const staticGrid = new THREE.GridHelper(gridSize, gridDivisions, 0x333333, 0x222222);
        // rotate so it's horizontal and move it down to the visual 'ground' below the box
        staticGrid.rotation.x = Math.PI / 2;
        staticGrid.position.y = - (boxSize * 0.5); // put grid under the box; adjust if needed
        scene.add(staticGrid);

        const axes = new THREE.AxesHelper(boxSize * 0.9);
        scene.add(axes);

        const boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const boxWire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x333399 }));
        scene.add(boxWire);

        // rocket sphere
        const rocketGeo = new THREE.SphereGeometry(Math.max(boxSize * 0.02, 0.05), 16, 16);
        const rocketMat = new THREE.MeshStandardMaterial({ color: 0xff3300, metalness: 0.2, roughness: 0.4 });
        const rocket = new THREE.Mesh(rocketGeo, rocketMat);
        scene.add(rocket);

        // trail
        const positions = new Float32Array(maxPoints * 3);
        positionsRef.current = positions;
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trailGeo.setDrawRange(0, 0);
        const trailMat = new THREE.LineBasicMaterial({ color: 0x00aaff, linewidth: 2 });
        const trailLine = new THREE.Line(trailGeo, trailMat);
        scene.add(trailLine);

        // simple orbit-like rotation via pointer drag
        let isDragging = false;
        let prevMouse = { x: 0, y: 0 };
        let targetRotation = { x: 0, y: 0 };
        let currentRotation = { x: 0.7, y: -0.6 };

        function onPointerDown(e) {
            isDragging = true;
            prevMouse.x = e.clientX;
            prevMouse.y = e.clientY;
        }
        function onPointerMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - prevMouse.x;
            const dy = e.clientY - prevMouse.y;
            prevMouse.x = e.clientX;
            prevMouse.y = e.clientY;
            targetRotation.x += dy * 0.005;
            targetRotation.y += dx * 0.005;
        }
        function onPointerUp() { isDragging = false; }

        renderer.domElement.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('resize', handleResize);

        // capture mouse events directly on the canvas so hovering works over the 3D view
        renderer.domElement.addEventListener('mousemove', handleMouseMove);
        renderer.domElement.addEventListener('mouseleave', handleMouseLeave);

        // optional: click to copy hovered coords to clipboard (requires secure context / browser support)
        function onCanvasClick(e) {
            if (!hoveredCoords) return;
            const text = `${hoveredCoords.x.toFixed(6)}, ${hoveredCoords.y.toFixed(6)}, ${hoveredCoords.z.toFixed(6)}`;
            try {
                navigator.clipboard?.writeText(text);
                // optionally show a quick visual indicator (console for now)
                console.info('[LocatorView] copied coords:', text);
            } catch (err) {
                console.warn('[LocatorView] clipboard write failed', err);
            }
        }
        renderer.domElement.addEventListener('click', onCanvasClick);

        function addPointToScene(x, y, z) {
            // write scaled scene coords into buffer (x,y,z are scene coords)
            const idx = trailIndexRef.current % maxPoints;
            positions[idx * 3] = x;
            positions[idx * 3 + 1] = y;
            positions[idx * 3 + 2] = z;
            trailIndexRef.current += 1;
            pointsCountRef.current = Math.min(pointsCountRef.current + 1, maxPoints);
            trailGeo.setDrawRange(0, pointsCountRef.current);

            // if wrapped, create ordered temp array for display (keeps chronological order)
            if (trailIndexRef.current <= maxPoints) {
                trailGeo.attributes.position.needsUpdate = true;
            } else {
                const temp = new Float32Array(pointsCountRef.current * 3);
                const start = trailIndexRef.current % maxPoints;
                for (let i = 0; i < pointsCountRef.current; i++) {
                    const src = (start + i) % maxPoints;
                    temp[i * 3] = positions[src * 3];
                    temp[i * 3 + 1] = positions[src * 3 + 1];
                    temp[i * 3 + 2] = positions[src * 3 + 2];
                }
                trailGeo.attributes.position.array.set(temp, 0);
                trailGeo.attributes.position.needsUpdate = true;
            }
            rocket.position.set(x, y, z);
        }

        function animate() {
            if (running) {
                currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
                currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;

                // orbit offset relative to the rocket position so the camera follows the rocket
                const dist = cameraDistanceRef.current; // controlled via zoom helpers
                const cx = dist * Math.cos(currentRotation.y) * Math.cos(currentRotation.x);
                const cz = dist * Math.sin(currentRotation.y) * Math.cos(currentRotation.x);
                const cy = dist * Math.sin(currentRotation.x);

                // follow target (rocket)
                const follow = rocket.position || new THREE.Vector3(0, 0, 0);
                const desired = new THREE.Vector3(follow.x + cx, follow.y + cy, follow.z + cz);

                // smooth the camera movement for a nicer follow experience
                camera.position.lerp(desired, 0.12);
                camera.lookAt(follow.x, follow.y, follow.z);

                // move follow-grid so it stays near the rocket (place it beneath rocket)
                const fg = followGridRef.current;
                if (fg) {
                    // place grid at same x/z as rocket and near the bottom of the visual box
                    // adjust offset factor if you prefer grid closer/further from rocket
                    const groundY = follow.y - (boxSize * 0.5);
                    fg.position.set(follow.x, groundY, follow.z);
                    fg.visible = followGridOn;
                }

                renderer.render(scene, camera);
            }
            animationRef.current = requestAnimationFrame(animate);
        }
        animate();

        const external = {
            addPoint: addPointToScene,
            clear: () => {
                trailIndexRef.current = 0;
                pointsCountRef.current = 0;
                positions.fill(0);
                trailGeo.setDrawRange(0, 0);
                trailGeo.attributes.position.needsUpdate = true;
                rocket.position.set(0, 0, 0);
            },
        };
        mount.__trajectoryExternal = external;

        // cleanup
        return () => {
            cancelAnimationFrame(animationRef.current);
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('resize', handleResize);
            try { renderer.domElement.removeEventListener('mousemove', handleMouseMove); } catch (e) { }
            try { renderer.domElement.removeEventListener('mouseleave', handleMouseLeave); } catch (e) { }
            try { renderer.domElement.removeEventListener('click', onCanvasClick); } catch (e) { }
            try { if (ro) ro.disconnect(); } catch (e) { /* ignore */ }
            try { if (mount && renderer.domElement && mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement); } catch (e) { /* ignore */ }
            try { trailGeo.dispose(); } catch (e) { /* ignore */ }
            try { trailMat.dispose(); } catch (e) { /* ignore */ }
            try { rocketGeo.dispose(); } catch (e) { /* ignore */ }
            try { rocketMat.dispose(); } catch (e) { /* ignore */ }
            try { edges.dispose(); } catch (e) { /* ignore */ }
            try { boxGeo.dispose(); } catch (e) { /* ignore */ }
        };
    }, [boxSize, maxPoints, running]);

    // --- MQTT connection and subscription
    useEffect(() => {
        if (simulate) {
            setConnected(false);
            setSubscribed(false);
            return;
        }

        // cleanup previous client
        if (mqttClientRef.current) {
            try { mqttClientRef.current.end(true); } catch (e) { }
            mqttClientRef.current = null;
        }

        let client = null;
        try {
            client = mqtt.connect(brokerUrl);
        } catch (err) {
            console.error('[LocatorView] mqtt.connect error', err);
            return;
        }
        mqttClientRef.current = client;

        client.on('connect', () => {
            setConnected(true);
            client.subscribe(topic, { qos: 0 }, (err, granted) => {
                if (!err) {
                    setSubscribed(true);
                    console.info('[LocatorView] subscribed to', topic);
                } else {
                    console.warn('[LocatorView] subscribe error', err);
                }
            });
        });

        client.on('reconnect', () => setConnected(false));
        client.on('offline', () => setConnected(false));
        client.on('close', () => { setConnected(false); setSubscribed(false); });
        client.on('error', (err) => console.warn('[LocatorView] error', err));

        client.on('message', (recvTopic, messageBuffer) => {
            const text = (messageBuffer || '').toString();
            let x, y, z;
            try {
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === 'object' && 'x' in parsed) {
                    x = Number(parsed.x);
                    y = Number(parsed.y);
                    z = Number(parsed.z);
                } else {
                    const parts = text.trim().split(/[,\s]+/).filter(Boolean);
                    x = Number(parts[0]); y = Number(parts[1]); z = Number(parts[2]);
                }
            } catch (e) {
                const parts = text.trim().split(/[,\s]+/).filter(Boolean);
                x = Number(parts[0]); y = Number(parts[1]); z = Number(parts[2]);
            }

            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                // set origin on first point if not present
                if (!originRef.current) originRef.current = { x, y, z };

                // compute relative (raw delta) and scaled scene coords
                const rx = x - originRef.current.x;
                const ry = y - originRef.current.y;
                const rz = z - originRef.current.z;
                const sx = rx * visualScaleRef.current;
                const sy = ry * visualScaleRef.current;
                const sz = rz * visualScaleRef.current;

                // add to scene
                const ext = mountRef.current && mountRef.current.__trajectoryExternal;
                if (ext) ext.addPoint(sx, sy, sz);

                // store raw + scaled for export/hover
                const entry = { x, y, z, t: new Date().toISOString(), sx, sy, sz };
                coordHistoryRef.current.push(entry);
                if (coordHistoryRef.current.length > maxSavedPoints) coordHistoryRef.current.shift();
                setHistoryCount(coordHistoryRef.current.length);
            } else {
                console.warn('[LocatorView] malformed coordinate:', text);
            }
        });

        return () => {
            try { if (mqttClientRef.current) { mqttClientRef.current.end(true); mqttClientRef.current = null; } } catch (e) { }
            setConnected(false);
            setSubscribed(false);
        };
    }, [brokerUrl, topic, simulate, running, maxSavedPoints]);

    // --- simulator (optional)
    useEffect(() => {
        if (!simulate || !running) return;
        const start = Date.now();
        const simInterval = 60;
        const timer = setInterval(() => {
            const t = (Date.now() - start) / 1000;
            const radius = Math.min(boxSize * 0.45, 5) * (1 + 0.05 * t);
            const rx = radius * Math.cos(t * 2.2);
            const ry = (t * 0.8) - boxSize / 2 + 1.5;
            const rz = radius * Math.sin(t * 2.2);

            // simulate raw coordinates by adding an arbitrary origin; for simplicity, set origin on first simulated point
            if (!originRef.current) originRef.current = { x: 0, y: 0, z: 0 };
            const sx = rx * visualScaleRef.current;
            const sy = ry * visualScaleRef.current;
            const sz = rz * visualScaleRef.current;

            const ext = mountRef.current && mountRef.current.__trajectoryExternal;
            if (ext) ext.addPoint(sx, sy, sz);

            const entry = { x: rx + (originRef.current?.x || 0), y: ry + (originRef.current?.y || 0), z: rz + (originRef.current?.z || 0), t: new Date().toISOString(), sx, sy, sz };
            coordHistoryRef.current.push(entry);
            if (coordHistoryRef.current.length > maxSavedPoints) coordHistoryRef.current.shift();
            setHistoryCount(coordHistoryRef.current.length);
        }, simInterval);
        return () => clearInterval(timer);
    }, [simulate, running, boxSize, maxSavedPoints]);

    // --- Export CSV
    const downloadCSV = () => {
        const arr = coordHistoryRef.current;
        if (!arr || arr.length === 0) {
            alert('No coordinates to download.');
            return;
        }
        const header = 'timestamp,raw_x,raw_y,raw_z,scene_x,scene_y,scene_z';
        const rows = arr.map((it) => `${it.t},${it.x},${it.y},${it.z},${it.sx},${it.sy},${it.sz}`);
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trajectory_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- Hover tooltip logic: project stored scene coords to screen and find nearest point
    const handleMouseMove = (e) => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const mount = mountRef.current;
        if (!renderer || !camera || !mount) return;

        const rect = mount.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const list = coordHistoryRef.current;
        if (!list || list.length === 0) {
            setTooltip({ visible: false, x: mx, y: my, content: null });
            return;
        }

        const canvasW = renderer.domElement.clientWidth || rect.width;
        const canvasH = renderer.domElement.clientHeight || rect.height;

        let nearest = null;
        let nearestDist = Infinity;
        // test last N points (latest are most relevant)
        const sampleFrom = Math.max(0, list.length - 1500); // limit for perf
        const v = new THREE.Vector3();
        for (let i = list.length - 1; i >= sampleFrom; i--) {
            const it = list[i];
            v.set(it.sx, it.sy, it.sz);
            v.project(camera); // normalized device coords
            const sx = (v.x * 0.5 + 0.5) * canvasW;
            const sy = (-v.y * 0.5 + 0.5) * canvasH;
            const dx = sx - mx;
            const dy = sy - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < nearestDist) {
                nearestDist = d2;
                nearest = { item: it, screenX: sx, screenY: sy };
            }
        }

        const pxThreshold = 18; // pixels
        if (nearest && Math.sqrt(nearestDist) <= pxThreshold) {
            const content = `x:${nearest.item.x.toFixed(3)}, y:${nearest.item.y.toFixed(3)}, z:${nearest.item.z.toFixed(3)}`;
            setTooltip({ visible: true, x: e.clientX, y: e.clientY, content });
            setHoveredCoords({ x: nearest.item.x, y: nearest.item.y, z: nearest.item.z, t: nearest.item.t });
        } else {
            setTooltip({ visible: false, x: mx, y: my, content: null });
            setHoveredCoords(null);
        }
    };

    const handleMouseLeave = () => {
        setTooltip({ visible: false, x: 0, y: 0, content: null });
    };

    const doClear = () => {
        const ext = mountRef.current && mountRef.current.__trajectoryExternal;
        if (ext) ext.clear();
        coordHistoryRef.current = [];
        setHistoryCount(0);
        originRef.current = null;
    };

    const doToggleRunning = () => setRunning((r) => !r);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={mountRef}
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                }}
            />
            {/* overlay controls */}
            <div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                    position: 'absolute',
                    left: 10,
                    top: 10,
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    padding: 8,
                    borderRadius: 6,
                    fontFamily: 'sans-serif',
                    fontSize: 13,
                    zIndex: 20,
                }}
            >
                <div style={{ marginBottom: 6 }}>
                    <strong>Trajectory 3D</strong>
                </div>
                {/* existing Download button ... */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <button onClick={downloadCSV} style={{ padding: '6px 8px' }}>Download coordinates</button>

                    {/* zoom & grid controls */}
                    <button onClick={() => { zoomIn(); }} style={{ padding: '6px 8px' }}>Zoom In</button>
                    <button onClick={() => { zoomOut(); }} style={{ padding: '6px 8px' }}>Zoom Out</button>
                </div>
            </div>

            {/* tooltip */}
            {tooltip.visible && tooltip.content && (
                <div
                    style={{
                        position: 'fixed',
                        left: tooltip.x-120,
                        top: tooltip.y-120,
                        pointerEvents: 'none',
                        background: 'rgba(0,0,0,0.85)',
                        color: 'white',
                        padding: '6px 8px',
                        borderRadius: 4,
                        fontFamily: 'monospace',
                        fontSize: 12,
                        zIndex: 9999,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {tooltip.content}
                </div>
            )}
        </div>
    );
}