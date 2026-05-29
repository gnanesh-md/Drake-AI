import React, { useState } from "react";

export function ImageUpload() {
  const [images, setImages] = useState([]); // To store uploaded images
  const [isDashboardVisible, setIsDashboardVisible] = useState(false); // To toggle dashboard view

  // Function to handle image uploads
  const handleImageUpload = (event) => {
    const uploadedImages = Array.from(event.target.files); // Get the selected images
    setImages((prevImages) => [...prevImages, ...uploadedImages]); // Append to existing images
  };

  // Function to handle "Done" button click
  const handleDone = () => {
    setIsDashboardVisible(true); // Show dashboard
  };

  return (
    <div className="overflow-hidden bg-neutral-800 h-screen">
      {!isDashboardVisible ? (
        // Image upload form
        <div className="flex gap-5 max-md:flex-col">
          <div className="flex flex-col w-[71%] max-md:ml-0 max-md:w-full">
            <div className="flex flex-col mt-20 w-full max-md:mt-10 max-md:max-w-full">
              <div className="text-5xl leading-none text-white max-md:max-w-full max-md:text-4xl">
                Graph OCR
              </div>
              <div className="mt-24 mr-8 max-md:mt-10 max-md:mr-2.5 max-md:max-w-full">
                <div className="flex gap-5 max-md:flex-col">
                  <div className="flex flex-col w-[43%] max-md:ml-0 max-md:w-full">
                    <div className="text-white">Upload Photos</div>
                    <div className="mt-4">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="text-white"
                      />
                      <div className="text-xs text-slate-400 mt-2">
                        Supports: PNG, JPG, JPEG, WEBP
                      </div>
                    </div>
                    <div className="flex gap-4 items-center self-stretch my-auto text-white mt-4">
                      <button
                        className="px-5 py-2 rounded-md shadow-sm bg-neutral-800"
                        onClick={handleDone}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Dashboard showing uploaded images
        <div className="flex flex-col items-center justify-center h-full text-white">
          <h2 className="text-4xl mb-8">Dashboard</h2>
          <div className="grid grid-cols-3 gap-4">
            {images.map((image, index) => (
              <img
                key={index}
                src={URL.createObjectURL(image)}
                alt={`Uploaded ${index}`}
                className="object-contain h-40 w-40"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
