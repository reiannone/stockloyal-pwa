{/* ✅ Broker logos vertically stacked, centered */}
<div className="flex flex-col space-y-4 mb-6">
  {brokers.map((b) => {
    const active = selected === b.id;
    return (
      <button
        key={b.id}
        type="button"
        onClick={() => handleBrokerSelect(b.id)}
        disabled={submitting}
        className={`w-full border rounded-lg h-24 flex items-center justify-center transition
          ${active ? "border-blue-600 ring-2 ring-blue-300" : "border-gray-300 hover:border-blue-400"}
          bg-white ${submitting ? "opacity-60 cursor-wait" : ""}`}
      >
        <img
          src={b.logo}
          alt={b.name}
          className="h-12 object-contain"
        />
      </button>
    );
  })}
</div>
