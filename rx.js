module.exports = {
    forkJoin: require('rxjs/internal/observable/forkJoin').forkJoin,
    from: require('rxjs/internal/observable/from').from,
    map: require('rxjs/internal/operators/map').map,
    merge: require('rxjs/internal/operators/merge').merge,
    mergeMap: require('rxjs/internal/operators/mergeMap').mergeMap,
    Observable: require('rxjs/internal/Observable').Observable,
    publishReplay: require('rxjs/internal/operators/publishReplay').publishReplay,
    share: require('rxjs/internal/operators/share').share,
    tap: require('rxjs/internal/operators/tap').tap,
    toArray: require('rxjs/internal/operators/toArray').toArray
};