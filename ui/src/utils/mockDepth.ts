/** Generate realistic-looking order book depth data around a mid price. */
export function generateDepthData(midPrice: number, levels = 20) {
  const spread = midPrice * 0.001;
  const result = [];

  // Bid side (below mid)
  let bidCumulative = 0;
  for (let i = levels; i >= 1; i--) {
    const price = midPrice - spread * i;
    bidCumulative += Math.random() * 500 + 100;
    result.push({ price: parseFloat(price.toFixed(2)), bidSize: bidCumulative, askSize: 0 });
  }

  // Ask side (above mid)
  let askCumulative = 0;
  for (let i = 1; i <= levels; i++) {
    const price = midPrice + spread * i;
    askCumulative += Math.random() * 500 + 100;
    result.push({ price: parseFloat(price.toFixed(2)), bidSize: 0, askSize: askCumulative });
  }

  return result.sort((a, b) => a.price - b.price);
}
