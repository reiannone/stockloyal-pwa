import React from "react";

export default function About() {
  return (
    <div className="about-container">
      <h2 className="heading-lg">About StockLoyal</h2>

      <section className="about-section">
        <h3 className="heading-md">Our Mission</h3>
        <p>
          At <strong>StockLoyal LLC</strong>, we believe investing should be
          inclusive, intuitive, and secure. We’re on a mission to empower
          everyday investors with tools that simplify portfolio management and
          keep financial wellness in focus.
        </p>
      </section>

      <section className="about-section">
        <h3 className="heading-md">Why We Exist</h3>
        <p>
          Traditional investing platforms can feel overwhelming or fragmented.
          StockLoyal was built to bridge that gap—providing clean UX, direct
          integrations with popular brokerages, and features that work for you,
          not against you.
        </p>
      </section>

      <section className="about-section">
        <h3 className="heading-md">Our Values</h3>
        <ul className="about-list">
          <li>
            <strong>Security first</strong> — We handle credentials securely via
            APIs controlled by your own back-end.
          </li>
          <li>
            <strong>Simplicity always</strong> — A clean interface helps you
            focus on what matters most.
          </li>
          <li>
            <strong>Privacy & integrity</strong> — Built as a U.S.-based LLC, we
            ensure your data stays private and protected.
          </li>
          <li>
            <strong>Customer-driven design</strong> — From broker selection
            flows to thoughtful hooks like goodbye flows, we center your
            experience.
          </li>
        </ul>
      </section>

      <section className="about-section">
        <h3 className="heading-md">What’s Next</h3>
        <p>
          We’re continuously evolving StockLoyal—to add features like in-app
          portfolio insights, alert systems, and integrations with more brokers
          and data sources. Stay tuned as we grow with you.
        </p>
      </section>

      <footer className="about-footer">
        &copy; {new Date().getFullYear()} StockLoyal LLC. All rights reserved.
      </footer>
    </div>
  );
}
