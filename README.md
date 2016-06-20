# safe_async

This is a wrapper around [async](caolan/async) functions so that the
callback won't be called until all started tasks have called their
callbacks. Standard *async* usually calls the callback right away on
an error, but that can mean that there are orphaned tasks that don't
know an error happened, so they are still trying to do their
work. Usually this is fine, but if in the callback you have to remove
some resources that the other task expects to be there, then you can
get into a bad position. *safe_async* wraps the tasks and callback
functions to monitor their progress, and will only call the final
callback when all the tasks have completed, even if there was an error.
