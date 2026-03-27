'use client';

import React, { useState } from 'react';
import { CameraCard, CameraData } from '@/components/admin-surveillance/CameraCard';
import { AddCameraCard } from '@/components/admin-surveillance/AddCameraCard';

const INITIAL_CAMERAS: CameraData[] = [
  {
    camera_id: 'cam-01',
    camera_name: 'Main Gate Exit',
    road_type: 'National Highway',
    latitude: 28.6139,
    longitude: 77.2090,
    digipin: '88GHC9+22',
    video_url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
    status: 'Idle',
  },
  {
    camera_id: 'cam-02',
    camera_name: 'Metro Pillar 42',
    road_type: 'City Road',
    latitude: 28.5355,
    longitude: 77.3910,
    digipin: '77FJD8+11',
    video_url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
    status: 'Pending Verification',
    verification_result: '',
  }
];

export default function SurveillancePage() {
  const [cameras, setCameras] = useState<CameraData[]>(INITIAL_CAMERAS);

  const handleUpdateCamera = (id: string, updates: Partial<CameraData>) => {
    setCameras(prev => prev.map(cam => 
      cam.camera_id === id ? { ...cam, ...updates } : cam
    ));
  };

  const handleDeleteCamera = (id: string) => {
    if (confirm("Are you sure you want to delete this surveillance node?")) {
      setCameras(prev => prev.filter(cam => cam.camera_id !== id));
    }
  };

  const handleAddCamera = () => {
    const newCamera: CameraData = {
      camera_id: crypto.randomUUID(),
      camera_name: 'New Camera Node',
      road_type: 'City Road',
      latitude: 28.0000,
      longitude: 77.0000,
      digipin: '',
      video_url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
      status: 'Idle',
    };
    setCameras(prev => [...prev, newCamera]);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 dark:bg-[#161616]">
      <div className="max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {cameras.map((camera) => (
            <CameraCard
              key={camera.camera_id}
              data={camera}
              onUpdate={handleUpdateCamera}
              onDelete={handleDeleteCamera}
            />
          ))}
          
          <AddCameraCard onClick={handleAddCamera} />
        </div>
        
        {cameras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-500 dark:text-gray-400 font-medium">No surveillance nodes active.</p>
            <p className="text-xs text-gray-400">Click the "Add New Camera" card to begin monitoring.</p>
          </div>
        )}
      </div>
    </div>
  );
}
