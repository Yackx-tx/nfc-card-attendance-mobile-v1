import { useEffect, useRef, useState, useCallback } from 'react';

export interface UsbCardReaderOptions {
  onCardScanned: (cardUid: string) => void;
  isEnabled?: boolean;
  maxInterKeyDelayMs?: number; // Maximum ms between characters to qualify as a hardware scanner burst
  minUidLength?: number;
}

export function normalizeRawCardUid(raw: string): string {
  if (!raw) return '';
  // Remove colons, dashes, spaces, tabs, line breaks
  const cleaned = raw.replace(/[:\s\-_]/g, '').trim();

  // If it's pure hex, return uppercase hex
  if (/^[0-9A-Fa-f]+$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  return cleaned.toUpperCase();
}

/**
 * Universal Hook for USB NFC / RFID Hardware Readers
 * Works out-of-the-box with all USB HID Keyboard Wedge Readers (ACR122U HID mode, Neuftech, Sycreader, etc.)
 */
export function useUsbCardReader({
  onCardScanned,
  isEnabled = true,
  maxInterKeyDelayMs = 70,
  minUidLength = 4,
}: UsbCardReaderOptions) {
  const [lastScannedUid, setLastScannedUid] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [webHidSupported, setWebHidSupported] = useState<boolean>(false);
  const [webHidConnected, setWebHidConnected] = useState<boolean>(false);
  const [webHidDeviceName, setWebHidDeviceName] = useState<string | null>(null);

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timingsRef = useRef<number[]>([]);
  const hidDeviceRef = useRef<any>(null);

  // Check WebHID support
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'hid' in navigator) {
      setWebHidSupported(true);
    }
  }, []);

  const triggerScan = useCallback((uid: string) => {
    const normalized = normalizeRawCardUid(uid);
    if (!normalized || normalized.length < minUidLength) return;

    setLastScannedUid(normalized);
    setScanCount((prev) => prev + 1);
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 800);

    onCardScanned(normalized);
  }, [minUidLength, onCardScanned]);

  // Global Keyboard Wedge Listener
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Check if user is typing in an active input element that isn't specifically our scanner
      const target = e.target as HTMLElement | null;
      const isExplicitScannerInput = target?.getAttribute('data-scanner-input') === 'true';

      // If 'Enter' is pressed, check if buffer contains a hardware scanner payload
      if (e.key === 'Enter') {
        const buffer = bufferRef.current.trim();
        const timings = timingsRef.current;

        // Reset tracking buffers
        bufferRef.current = '';
        timingsRef.current = [];

        if (buffer.length >= minUidLength) {
          // Average inter-key timing calculation
          const avgInterval = timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 999;
          
          // Hardware scanners emit characters with avg interval under 50-65ms.
          // If explicit scanner input or avg interval indicates high-speed scanner:
          const isHardwareScanner = avgInterval <= maxInterKeyDelayMs || isExplicitScannerInput;

          if (isHardwareScanner) {
            e.preventDefault();
            e.stopPropagation();
            triggerScan(buffer);
            return;
          }
        }
        return;
      }

      // Ignore modifiers and control keys
      if (e.key.length > 1 && e.key !== 'Backspace') {
        return;
      }

      if (e.key === 'Backspace') {
        bufferRef.current = bufferRef.current.slice(0, -1);
        return;
      }

      // If time delta between consecutive keys is too large (> 120ms), and not inside scanner input,
      // it is likely human typing. Clear stale buffer to prevent accidental combinations.
      if (timeSinceLastKey > 150 && !isExplicitScannerInput) {
        bufferRef.current = '';
        timingsRef.current = [];
      }

      if (bufferRef.current.length > 0) {
        timingsRef.current.push(timeSinceLastKey);
      }

      // Append character to buffer
      bufferRef.current += e.key;

      // Prevent buffer from growing indefinitely
      if (bufferRef.current.length > 64) {
        bufferRef.current = bufferRef.current.slice(-64);
        timingsRef.current = timingsRef.current.slice(-64);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isEnabled, maxInterKeyDelayMs, minUidLength, triggerScan]);

  // WebHID Direct USB Reader Connection (for ACR122U and compatible CCID readers)
  const connectWebHid = async (): Promise<boolean> => {
    if (!('hid' in navigator)) {
      throw new Error('WebHID is not supported in this browser. Please use Chrome, Edge, or a Chromium browser.');
    }

    try {
      // ACR122U USB Vendor ID: 0x072f, Product ID: 0x2200
      const devices = await (navigator as any).hid.requestDevice({
        filters: [
          { vendorId: 0x072f }, // Advanced Card Systems (ACR122U, etc.)
          { vendorId: 0x04e6 }, // SCM Microsystems
          { vendorId: 0x058f }, // Alcor Micro
        ],
      });

      if (devices.length === 0) return false;

      const device = devices[0];
      await device.open();
      hidDeviceRef.current = device;
      setWebHidConnected(true);
      setWebHidDeviceName(device.productName || 'USB NFC Reader');

      device.addEventListener('inputreport', (event: any) => {
        const { data } = event;
        // Parse PC/SC CCID response
        const bytes = new Uint8Array(data.buffer);
        if (bytes.length >= 10) {
          // Look for UID payload in CCID RDR_to_PC_DataBlock (0x80)
          const hex = Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
          // Extract last 4-8 bytes as card UID
          const candidateUid = hex.slice(-16);
          triggerScan(candidateUid);
        }
      });

      return true;
    } catch (err: any) {
      console.error('WebHID connection error:', err);
      throw err;
    }
  };

  const disconnectWebHid = async () => {
    if (hidDeviceRef.current) {
      try {
        await hidDeviceRef.current.close();
      } catch {}
      hidDeviceRef.current = null;
    }
    setWebHidConnected(false);
    setWebHidDeviceName(null);
  };

  return {
    lastScannedUid,
    scanCount,
    isCapturing,
    webHidSupported,
    webHidConnected,
    webHidDeviceName,
    connectWebHid,
    disconnectWebHid,
    simulateScan: triggerScan,
  };
}
