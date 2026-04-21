import { useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function WebSignaturePad({ onOK, onCancel, title = "Sign Above" }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef({ drawing: false });

  const setup = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 800;
    const cssHeight = canvas.clientHeight || 300;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
  };

  useEffect(() => {
    setup();
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX ?? 0) - rect.left, y: (e.clientY ?? 0) - rect.top };
  };

  const onPointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    drawingRef.current.drawing = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e) => {
    if (!drawingRef.current.drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onPointerUp = () => {
    drawingRef.current.drawing = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL("image/png");
      if (onOK) onOK(dataUrl);
    } catch (e) {
      // ignore
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.box}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: 260, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </View>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={clear}>
          <Text style={styles.btnOutlineText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={save}>
          <Text style={styles.btnPrimaryText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onCancel}>
          <Text style={styles.btnPrimaryText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "900", marginBottom: 12, color: "#111827" },
  box: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, overflow: "hidden", backgroundColor: "#f8fafc" },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 14 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnOutline: { borderWidth: 1, borderColor: "#2563eb" },
  btnOutlineText: { color: "#2563eb", fontWeight: "900" },
  btnPrimary: { backgroundColor: "#2563eb" },
  btnDanger: { backgroundColor: "#ef4444" },
  btnPrimaryText: { color: "#fff", fontWeight: "900" },
});

