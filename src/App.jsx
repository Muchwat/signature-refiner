import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Crop, X, Check, RotateCcw, Move, MousePointer } from 'lucide-react'; // Lucide icons
// index.js or App.js
import './index.css';

// Main App component for the signature image refiner
const App = () => {
  // State to store the uploaded image file
  const [imageFile, setImageFile] = useState(null);
  // State to store the processed image data URL for download
  const [processedImageUrl, setProcessedImageUrl] = useState(null);
  // State to manage loading indicator during processing
  const [isLoading, setIsLoading] = useState(false);
  // State for error messages
  const [error, setError] = useState('');

  // State for the alpha threshold (for initial transparency)
  const [alphaThreshold, setAlphaThreshold] = useState(50); // Default value, lower means more transparent
  // State for the luminance threshold (for background color stripping)
  // Higher value means lighter colors are considered background
  const [luminanceThreshold, setLuminanceThreshold] = useState(200); // Default value (0-255)

  // State for cropping functionality
  const [isCropping, setIsCropping] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // True if moving or resizing crop box
  const [dragMode, setDragMode] = useState(null); // 'move', 'nw', 'ne', 'sw', 'se', 'draw' (for resize handles or drawing new)
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); // Offset for moving the crop box
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 }); // For 'draw' mode
  const [currentCursor, setCurrentCursor] = useState('default'); // State for dynamic cursor

  // Refs for the canvas elements
  const originalCanvasRef = useRef(null);
  const processedCanvasRef = useRef(null);
  const imgRef = useRef(null); // Ref to store the Image object once loaded

  // Constants for resize handle size
  const HANDLE_SIZE = 12;

  /**
   * Helper function to get mouse/touch coordinates relative to the canvas.
   * @param {Object} event - Mouse or Touch event.
   * @param {HTMLCanvasElement} canvas - The canvas element.
   * @returns {Object} { x, y } coordinates.
   */
  const getCanvasCoords = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  /**
   * Checks if a point is within a resize handle.
   * @param {number} mouseX - Mouse X coordinate.
   * @param {number} mouseY - Mouse Y coordinate.
   * @param {number} handleX - Handle X coordinate.
   * @param {number} handleY - Handle Y coordinate.
   * @returns {boolean} True if point is within handle.
   */
  const isInsideHandle = (mouseX, mouseY, handleX, handleY) => {
    return mouseX >= handleX - HANDLE_SIZE / 2 &&
      mouseX <= handleX + HANDLE_SIZE / 2 &&
      mouseY >= handleY - HANDLE_SIZE / 2 &&
      mouseY <= handleY + HANDLE_SIZE / 2;
  };

  /**
   * Normalizes a crop object to ensure positive width/height and correct x,y.
   * This is crucial when resizing, as dragging a handle past the opposite corner
   * can result in negative width/height.
   * @param {Object} crop - The crop object { x, y, width, height }.
   * @returns {Object} Normalized crop object.
   */
  const normalizeCrop = (crop) => {
    let { x, y, width, height } = crop;
    if (width < 0) {
      x += width; // Move x to the new left edge
      width = Math.abs(width);
    }
    if (height < 0) {
      y += height; // Move y to the new top edge
      height = Math.abs(height);
    }
    return { x, y, width, height };
  };

  /**
   * Draws the processed image onto the processed canvas and then draws the crop overlay.
   * This function is responsible for all drawing on the processed canvas.
   */
  const drawCanvasContent = useCallback(() => {
    const processedCanvas = processedCanvasRef.current;
    if (!processedCanvas || !processedImageUrl) return;

    const ctxProcessed = processedCanvas.getContext('2d');

    // Load the processed image from its URL
    const img = new Image();
    img.onload = () => {
      // Clear the canvas and draw the base image
      ctxProcessed.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
      ctxProcessed.drawImage(img, 0, 0, processedCanvas.width, processedCanvas.height);

      // If cropping is active, draw the overlay and handles
      if (isCropping && crop.width > 0 && crop.height > 0) {
        // Dim the area outside the crop box with gradient
        const gradient = ctxProcessed.createLinearGradient(0, 0, 0, processedCanvas.height);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');

        ctxProcessed.fillStyle = gradient;
        ctxProcessed.fillRect(0, 0, processedCanvas.width, crop.y); // Top overlay
        ctxProcessed.fillRect(0, crop.y + crop.height, processedCanvas.width, processedCanvas.height - (crop.y + crop.height)); // Bottom overlay
        ctxProcessed.fillRect(0, crop.y, crop.x, crop.height); // Left overlay
        ctxProcessed.fillRect(crop.x + crop.width, crop.y, processedCanvas.width - (crop.x + crop.width), crop.height); // Right overlay

        // Draw the crop rectangle border with dashed line
        ctxProcessed.strokeStyle = '#3b82f6'; // Tailwind blue-500
        ctxProcessed.lineWidth = 2;
        ctxProcessed.setLineDash([5, 5]); // Dashed line
        ctxProcessed.strokeRect(crop.x, crop.y, crop.width, crop.height);
        ctxProcessed.setLineDash([]); // Reset line dash

        // Draw resize handles with better styling
        ctxProcessed.fillStyle = '#3b82f6'; // Tailwind blue-500
        ctxProcessed.strokeStyle = '#ffffff'; // White border for handles
        ctxProcessed.lineWidth = 2;

        const handles = [
          { x: crop.x, y: crop.y }, // Top-left
          { x: crop.x + crop.width, y: crop.y }, // Top-right
          { x: crop.x, y: crop.y + crop.height }, // Bottom-left
          { x: crop.x + crop.width, y: crop.y + crop.height } // Bottom-right
        ];

        handles.forEach(handle => {
          ctxProcessed.beginPath();
          ctxProcessed.arc(handle.x, handle.y, HANDLE_SIZE / 2, 0, 2 * Math.PI); // Circular handles
          ctxProcessed.fill();
          ctxProcessed.stroke();
        });
      }
    };
    img.src = processedImageUrl;
  }, [processedImageUrl, isCropping, crop]); // Dependencies: processedImageUrl, isCropping, crop

  /**
   * Processes the image on the canvas to refine edges and make text black.
   * This function is memoized using useCallback to avoid unnecessary re-creations.
   */
  const processImage = useCallback(() => {
    if (!imgRef.current || !originalCanvasRef.current || !processedCanvasRef.current) {
      return; // Do nothing if image or canvases are not ready
    }

    setIsLoading(true);
    setError(''); // Clear any previous errors

    const img = imgRef.current;
    const originalCanvas = originalCanvasRef.current;
    const processedCanvas = processedCanvasRef.current;

    // Set canvas dimensions to match the image
    originalCanvas.width = img.width;
    originalCanvas.height = img.height;
    processedCanvas.width = img.width;
    processedCanvas.height = img.height;

    // Get 2D contexts for both canvases
    const ctxOriginal = originalCanvas.getContext('2d');
    const ctxProcessed = processedCanvas.getContext('2d');

    // Clear canvases before drawing new image
    ctxOriginal.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    ctxProcessed.clearRect(0, 0, processedCanvas.width, processedCanvas.height);

    // Draw the original image onto the original canvas
    ctxOriginal.drawImage(img, 0, 0);

    // Get image data from the original canvas
    const imageData = ctxOriginal.getImageData(0, 0, img.width, img.height);
    const data = imageData.data; // Pixel data array (R, G, B, A for each pixel)

    // Iterate through each pixel to process it
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];     // Red channel
      const g = data[i + 1]; // Green channel
      const b = data[i + 2]; // Blue channel
      const alpha = data[i + 3]; // Alpha channel

      // Calculate luminance (perceived brightness) of the pixel
      // A common formula: 0.299*R + 0.587*G + 0.114*B
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b);

      // Logic to determine if a pixel is background or part of the signature
      // If the pixel is very light (high luminance) OR very transparent (low alpha),
      // consider it background and make it fully transparent.
      if (luminance > luminanceThreshold || alpha < alphaThreshold) {
        data[i + 3] = 0; // Alpha (fully transparent)
      } else {
        // Otherwise, it's part of the signature, make it pure black and fully opaque.
        data[i] = 0;     // Red
        data[i + 1] = 0; // Green
        data[i + 2] = 0; // Blue
        data[i + 3] = 255; // Alpha (fully opaque)
      }
    }

    // Put the processed image data back onto the processed canvas
    ctxProcessed.putImageData(imageData, 0, 0);

    // Get the data URL of the processed image for download
    // Use image/png to preserve transparency
    setProcessedImageUrl(processedCanvas.toDataURL('image/png'));
    setIsLoading(false);
  }, [alphaThreshold, luminanceThreshold]); // Dependency array: re-run processImage when thresholds change

  /**
   * Handles the file input change event.
   * Reads the selected image file and sets it to state.
   * @param {Object} event - The file input change event.
   */
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (e.g., PNG, JPG).');
        setImageFile(null);
        setProcessedImageUrl(null);
        imgRef.current = null; // Clear image ref
        setIsCropping(false); // Reset cropping state
        setCrop({ x: 0, y: 0, width: 0, height: 0 }); // Reset crop area
        return;
      }
      setImageFile(file);
      setProcessedImageUrl(null); // Reset processed image when a new one is uploaded
      setError(''); // Clear any previous errors
      setIsCropping(false); // Reset cropping state
      setCrop({ x: 0, y: 0, width: 0, height: 0 }); // Reset crop area
    }
  };

  /**
   * Effect to load the image and trigger initial processing.
   * Runs when imageFile changes.
   */
  useEffect(() => {
    if (!imageFile) {
      imgRef.current = null; // Clear image ref if no file
      // Clear canvases when no image is selected
      const originalCanvas = originalCanvasRef.current;
      const processedCanvas = processedCanvasRef.current;
      if (originalCanvas) {
        originalCanvas.getContext('2d').clearRect(0, 0, originalCanvas.width, originalCanvas.height);
      }
      if (processedCanvas) {
        processedCanvas.getContext('2d').clearRect(0, 0, processedCanvas.width, processedCanvas.height);
      }
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img; // Store the image object
        processImage(); // Process the image once loaded
        // Set initial crop to cover the whole image. This will be updated when cropping is enabled.
        setCrop({ x: 0, y: 0, width: img.width, height: img.height });
      };
      img.onerror = () => {
        setError('Could not load image. Please ensure it is a valid image file.');
        setIsLoading(false);
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      setError('Could not read file. Please try again.');
      setIsLoading(false);
    };
    reader.readAsDataURL(imageFile);
  }, [imageFile, processImage]); // Dependency array: re-run effect when imageFile or processImage changes

  /**
   * Effect to re-process image when alphaThreshold or luminanceThreshold changes, if an image is loaded.
   */
  useEffect(() => {
    if (imageFile && imgRef.current) {
      processImage();
    }
  }, [alphaThreshold, luminanceThreshold, imageFile, processImage]); // Re-run when thresholds change or imageFile/processImage changes

  /**
   * Effect to redraw the canvas content when crop state changes or cropping is enabled/disabled,
   * or when the processed image URL changes.
   */
  useEffect(() => {
    drawCanvasContent();
  }, [crop, isCropping, processedImageUrl, drawCanvasContent]);

  /**
   * Handles the download button click.
   * Creates a temporary link to download the processed image.
   */
  const handleDownload = () => {
    if (processedImageUrl) {
      const link = document.createElement('a');
      link.href = processedImageUrl;
      link.download = 'refined_signature.png'; // Suggested filename
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  /**
   * Handles mouse down event on the processed canvas for cropping.
   */
  const handleCanvasMouseDown = (e) => {
    if (!isCropping || isLoading) return;

    setIsDragging(true);
    const canvas = processedCanvasRef.current;
    const { x, y } = getCanvasCoords(e, canvas);

    // Check if clicking on a resize handle
    if (isInsideHandle(x, y, crop.x, crop.y)) {
      setDragMode('nw');
    } else if (isInsideHandle(x, y, crop.x + crop.width, crop.y)) {
      setDragMode('ne');
    } else if (isInsideHandle(x, y, crop.x, crop.y + crop.height)) {
      setDragMode('sw');
    } else if (isInsideHandle(x, y, crop.x + crop.width, crop.y + crop.height)) {
      setDragMode('se');
    } else if (x > crop.x && x < crop.x + crop.width && y > crop.y && y < crop.y + crop.height) {
      // Check if clicking inside the crop box to move it
      setDragMode('move');
      setDragOffset({ x: x - crop.x, y: y - crop.y });
    } else {
      // If clicking outside, start a new crop area
      setDragMode('draw');
      setStartPoint({ x, y });
      setCrop({ x, y, width: 0, height: 0 }); // Reset crop for new drawing
    }
  };

  /**
   * Handles mouse move event on the processed canvas for cropping.
   */
  const handleCanvasMouseMove = (e) => {
    const canvas = processedCanvasRef.current;
    const { x: currentX, y: currentY } = getCanvasCoords(e, canvas);

    // Update cursor based on position, even if not dragging
    if (isCropping && !isDragging) {
      if (isInsideHandle(currentX, currentY, crop.x, crop.y)) {
        setCurrentCursor('nw-resize');
      } else if (isInsideHandle(currentX, currentY, crop.x + crop.width, crop.y)) {
        setCurrentCursor('ne-resize');
      } else if (isInsideHandle(currentX, currentY, crop.x, crop.y + crop.height)) {
        setCurrentCursor('sw-resize');
      } else if (isInsideHandle(currentX, currentY, crop.x + crop.width, crop.y + crop.height)) {
        setCurrentCursor('se-resize');
      } else if (currentX > crop.x && currentX < crop.x + crop.width && currentY > crop.y && currentY < crop.y + crop.height) {
        setCurrentCursor('grab'); // Cursor for moving the box
      } else {
        setCurrentCursor('crosshair'); // Default for drawing new crop
      }
    } else if (!isCropping) {
      setCurrentCursor('default'); // Reset cursor when not in cropping mode
    }


    if (!isDragging || !isCropping || isLoading) return; // Only process crop updates if dragging

    setCrop(prevCrop => {
      let tempX = prevCrop.x;
      let tempY = prevCrop.y;
      let tempWidth = prevCrop.width;
      let tempHeight = prevCrop.height;

      switch (dragMode) {
        case 'move':
          tempX = currentX - dragOffset.x;
          tempY = currentY - dragOffset.y;
          break;
        case 'draw':
          tempX = startPoint.x;
          tempY = startPoint.y;
          tempWidth = currentX - startPoint.x;
          tempHeight = currentY - startPoint.y;
          break;
        case 'nw': // North-West handle
          tempWidth = prevCrop.width + (prevCrop.x - currentX);
          tempHeight = prevCrop.height + (prevCrop.y - currentY);
          tempX = currentX;
          tempY = currentY;
          break;
        case 'ne': // North-East handle
          tempWidth = currentX - prevCrop.x;
          tempHeight = prevCrop.height + (prevCrop.y - currentY);
          tempY = currentY;
          break;
        case 'sw': // South-West handle
          tempWidth = prevCrop.width + (prevCrop.x - currentX);
          tempHeight = currentY - prevCrop.y;
          tempX = currentX;
          break;
        case 'se': // South-East handle
          tempWidth = currentX - prevCrop.x;
          tempHeight = currentY - prevCrop.y;
          break;
        default:
          return prevCrop; // No valid drag mode
      }

      // Normalize crop to ensure positive width/height and correct x,y
      const normalized = normalizeCrop({ x: tempX, y: tempY, width: tempWidth, height: tempHeight });

      // Apply boundary checks after normalization
      let finalX = Math.max(0, Math.min(normalized.x, canvas.width - normalized.width));
      let finalY = Math.max(0, Math.min(normalized.y, canvas.height - normalized.height));
      let finalWidth = normalized.width;
      let finalHeight = normalized.height;

      // Adjust width/height if it goes beyond canvas boundaries due to x/y clamping
      if (finalX + finalWidth > canvas.width) {
        finalWidth = canvas.width - finalX;
      }
      if (finalY + finalHeight > canvas.height) {
        finalHeight = canvas.height - finalY;
      }

      return { x: finalX, y: finalY, width: finalWidth, height: finalHeight };
    });
  };

  /**
   * Handles mouse up event on the processed canvas for cropping.
   */
  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDragMode(null);
    if (isCropping) { // Ensure cursor resets correctly after dragging
      setCurrentCursor('crosshair');
    }
  };

  /**
   * Applies the current crop selection to the image.
   */
  const handleApplyCrop = () => {
    if (!processedImageUrl || !processedCanvasRef.current || crop.width === 0 || crop.height === 0) {
      setError('Please select a valid crop area first.');
      return;
    }

    setIsLoading(true);
    setError('');

    const sourceCanvas = processedCanvasRef.current;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Scale crop coordinates to actual image size if canvas is scaled for display
    // This is crucial for accurate cropping when canvas display size != actual pixel size
    const scaleX = sourceCanvas.width / sourceCanvas.getBoundingClientRect().width;
    const scaleY = sourceCanvas.height / sourceCanvas.getBoundingClientRect().height;

    const actualCropX = crop.x * scaleX;
    const actualCropY = crop.y * scaleY;
    const actualCropWidth = crop.width * scaleX;
    const actualCropHeight = crop.height * scaleY;

    tempCanvas.width = actualCropWidth;
    tempCanvas.height = actualCropHeight;

    // Draw the cropped portion of the source canvas onto the temporary canvas
    tempCtx.drawImage(
      sourceCanvas,
      actualCropX,
      actualCropY,
      actualCropWidth,
      actualCropHeight,
      0,
      0,
      actualCropWidth,
      actualCropHeight
    );

    // Update the processed image URL with the cropped image
    setProcessedImageUrl(tempCanvas.toDataURL('image/png'));
    setIsLoading(false);
    setIsCropping(false); // Exit cropping mode after applying
    setCrop({ x: 0, y: 0, width: 0, height: 0 }); // Reset crop area after applying
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-inter text-gray-800 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header Section */}
        <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-8 px-6 text-center rounded-t-3xl">
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-2 tracking-tight">
            Signature Refiner
          </h1>
          <p className="text-blue-100 text-lg sm:text-xl max-w-2xl mx-auto">
            Transform your handwritten signature into a crisp, transparent digital image.
          </p>
        </header>

        <main className="p-6 sm:p-8 md:p-10 lg:grid lg:grid-cols-3 lg:gap-10">
          {/* Upload and Controls Section (Left/Top) */}
          <section className="lg:col-span-1 mb-8 lg:mb-0 space-y-8">
            {/* Upload Card */}
            <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-200">
              <div className="flex flex-col items-center space-y-5">
                <div className="w-28 h-28 bg-blue-50 rounded-full flex items-center justify-center shadow-inner">
                  <Upload className="w-14 h-14 text-blue-500" />
                </div>
                <label
                  htmlFor="image-upload"
                  className="cursor-pointer bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-4 px-8 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl text-lg text-center w-full"
                >
                  Choose Signature Image
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {imageFile && (
                  <div className="text-center mt-4">
                    <p className="text-green-600 font-medium text-base flex items-center justify-center">
                      <Check className="w-5 h-5 mr-2" /> {imageFile.name}
                    </p>
                    <p className="text-sm text-gray-500">Image loaded successfully</p>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-w-md text-center w-full">
                    <p className="text-red-700 text-sm font-medium">{error}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Controls Card */}
            {imageFile && (
              <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Refinement Controls</h2>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-lg font-semibold text-gray-700 flex items-center">
                        <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                        Background Removal
                      </label>
                      <span className="font-mono text-blue-600 text-lg">{luminanceThreshold}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={luminanceThreshold}
                      onChange={(e) => setLuminanceThreshold(parseInt(e.target.value))}
                      className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      Adjust to remove more light-colored backgrounds.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-lg font-semibold text-gray-700 flex items-center">
                        <span className="w-3 h-3 bg-indigo-500 rounded-full mr-2"></span>
                        Edge Sharpening
                      </label>
                      <span className="font-mono text-indigo-600 text-lg">{alphaThreshold}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={alphaThreshold}
                      onChange={(e) => setAlphaThreshold(parseInt(e.target.value))}
                      className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      Lower values create sharper, cleaner edges.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Image Display Section (Right/Bottom) */}
          {imageFile && (
            <section className="lg:col-span-2 space-y-8">
              <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-200">
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Original Image */}
                  <div className="space-y-4 flex flex-col items-center">
                    <h3 className="text-xl font-bold text-gray-900 text-center">Original Image</h3>
                    <div className="bg-gray-50 rounded-xl p-4 border-2 border-dashed border-gray-200 flex justify-center items-center w-full h-64 overflow-hidden">
                      <canvas
                        ref={originalCanvasRef}
                        className="max-w-full max-h-full rounded-lg shadow-md object-contain"
                      />
                    </div>
                  </div>

                  {/* Processed Image */}
                  <div className="space-y-4 flex flex-col items-center">
                    <div className="flex items-center justify-center space-x-2">
                      <h3 className="text-xl font-bold text-gray-900">Refined Image</h3>
                      {isCropping && (
                        <div className="flex items-center space-x-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-sm font-medium">
                          <Crop className="w-4 h-4" />
                          <span>Crop Mode</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 border-2 border-dashed border-gray-200 relative flex justify-center items-center w-full h-64 overflow-hidden">
                      <canvas
                        ref={processedCanvasRef}
                        className={`max-w-full max-h-full block rounded-lg shadow-md transition-all duration-200 ${currentCursor === 'crosshair' ? 'cursor-crosshair' : ''} ${currentCursor === 'grab' ? 'cursor-grab' : ''} ${currentCursor.includes('resize') ? `cursor-${currentCursor}` : ''}`}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={handleCanvasMouseUp} // End dragging if mouse leaves canvas
                        onTouchStart={handleCanvasMouseDown}
                        onTouchMove={handleCanvasMouseMove}
                        onTouchEnd={handleCanvasMouseUp}
                        onTouchCancel={handleCanvasMouseUp}
                      />
                      {isCropping && (
                        <div className="absolute top-4 right-4 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-md">
                          Drag to move • Handles to resize
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {processedImageUrl && !isLoading && (
                <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-200">
                  <div className="flex flex-wrap justify-center gap-4">
                    {!isCropping ? (
                      <>
                        <button
                          onClick={() => {
                            setIsCropping(true);
                            // Set initial crop to cover the whole image when enabling cropping
                            const canvas = processedCanvasRef.current;
                            if (canvas) {
                              setCrop({ x: 0, y: 0, width: canvas.width, height: canvas.height });
                            }
                          }}
                          className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                        >
                          <Crop className="w-5 h-5" />
                          <span>Crop Image</span>
                        </button>
                        <button
                          onClick={handleDownload}
                          className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
                        >
                          <Download className="w-5 h-5" />
                          <span>Download Signature</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleApplyCrop}
                          className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
                        >
                          <Check className="w-5 h-5" />
                          <span>Apply Crop</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsCropping(false);
                            setCrop({ x: 0, y: 0, width: 0, height: 0 }); // Reset crop area
                            processImage(); // Redraw the full processed image
                          }}
                          className="flex items-center space-x-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          <X className="w-5 h-5" />
                          <span>Cancel</span>
                        </button>
                        <button
                          onClick={() => {
                            const canvas = processedCanvasRef.current;
                            if (canvas) {
                              setCrop({ x: 0, y: 0, width: canvas.width, height: canvas.height });
                            }
                          }}
                          className="flex items-center space-x-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                        >
                          <RotateCcw className="w-5 h-5" />
                          <span>Reset Crop</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-10 text-center shadow-2xl animate-fade-in-up">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-6"></div>
              <p className="text-gray-700 font-medium text-lg">Processing your signature...</p>
              <p className="text-gray-500 text-sm mt-2">Please wait a moment.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
