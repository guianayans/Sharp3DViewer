import React, { useEffect, useRef } from 'react';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

export default function GaussianViewer({ plyUrl, disableControls = false }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!plyUrl || !containerRef.current) return undefined;

    const viewer = new GaussianSplats3D.Viewer({
      cameraUp: [0, 1, 0],
      initialCameraPosition: [0, 0, 3],
      initialCameraLookAt: [0, 0, 0],
      rootElement: containerRef.current,
      sharedMemoryForWorkers: false
    });

    viewerRef.current = viewer;

    viewer
      .addSplatScene(plyUrl, {
        format: GaussianSplats3D.SceneFormat.Ply,
        showLoadingUI: true,
        progressiveLoad: true,
        rotation: [1, 0, 0, 0],
        position: [0, 0, 0],
        scale: [1, 1, 1]
      })
      .then(() => {
        viewer.start();
        if (viewer.controls) {
          viewer.controls.keys = {
            LEFT: 'KeyA',
            UP: 'KeyW',
            RIGHT: 'KeyD',
            BOTTOM: 'KeyS'
          };
          viewer.controls.keyPanSpeed = 35;
          viewer.controls.enablePan = true;
          viewer.controls.enabled = !disableControls;
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar ply:', err);
      });

    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
    };
  }, [plyUrl]);

  useEffect(() => {
    if (viewerRef.current && viewerRef.current.controls) {
      viewerRef.current.controls.enabled = !disableControls;
    }
  }, [disableControls]);

  return <div ref={containerRef} className="viewer-canvas" />;
}
