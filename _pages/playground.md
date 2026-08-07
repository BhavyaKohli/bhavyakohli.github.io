---
layout: page
permalink: /playground/
title: Playground
nav: true
nav_order: 2
dropdown: true
children:
  - title: Graphs
    permalink: /playground/graphs/
  - title: Dot Matrix
    permalink: /playground/dotmatrix/
---
<style>
  .ui-test-grid {
    margin-top: 1rem;
  }

  .ui-test-grid .card {
    background: #111;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    overflow: hidden;
  }

  .ui-preview {
    height: 240px;
    background: #0a0a0a;
  }

  .ui-test-grid .card-title {
    color: #fff;
    margin-bottom: 0.25rem;
  }

  .ui-test-grid .card-title a {
    color: #fff;
  }

  .ui-test-grid .card-text {
    color: rgba(255, 255, 255, 0.75);
  }

  .ui-test-grid .card-body {
    padding-top: 0.75rem;
  }
</style>

<p>
  A gallery of small interactive experiments. Each card below is a live preview —
  poke and click the toys right here, then open the full page for the undistracted
  version.
</p>

<div class="row ui-test-grid">
  <div class="col-md-6 mb-4">
    <div class="card">
      <div class="ui-preview" id="ui-preview-graphs"></div>
      <div class="card-body">
        <h5 class="card-title"><a href="{{ '/graphs/' | relative_url }}">Graphs</a></h5>
        <p class="card-text">Molecular graphs drift in from the edges, fuse into hinged molecules, and dissolve back into a fresh graph once they have merged enough. Click an empty spot to spawn one, or click a graph to nudge it.</p>
        <a href="{{ '/graphs/' | relative_url }}" class="btn btn-sm btn-outline-light" role="button">Open full page</a>
      </div>
    </div>
  </div>

  <div class="col-md-6 mb-4">
    <div class="card">
      <div class="ui-preview" id="ui-preview-dotmatrix"></div>
      <div class="card-body">
        <h5 class="card-title"><a href="{{ '/testing/' | relative_url }}">Playground</a></h5>
        <p class="card-text">A lattice of dots that swells and ripples around your cursor, and snaps back into place as you move on. Click to send a wave through the field.</p>
        <a href="{{ '/testing/' | relative_url }}" class="btn btn-sm btn-outline-light" role="button">Open full page</a>
      </div>
    </div>
  </div>
</div>
