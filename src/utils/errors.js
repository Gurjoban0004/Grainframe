export const ErrorTypes = {
  IMAGE_LOAD_FAILED: {
    message: 'Could not load the image. Please try a different file.',
    recoverable: true,
  },
  IMAGE_TOO_LARGE: {
    message: 'This image is too large to process. Try a smaller photo.',
    recoverable: true,
  },
  PROCESSING_FAILED: {
    message: 'Processing failed. Please try again.',
    recoverable: true,
  },
  EXPORT_FAILED: {
    message: 'Export failed. Please try again.',
    recoverable: true,
  },
};
